import { Fragment, useState, useEffect, useCallback, useId, useMemo } from 'react'
import {
  Package,
  Search,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Edit3,
  FileSpreadsheet,
  MapPin,
  Loader2,
  Check,
  Plus,
  PackagePlus,
} from 'lucide-react'
import { api, clearProductsCache } from '../lib/api.js'
import { exportToExcel } from '../lib/exportExcel.js'
import { matchesQuery } from '../lib/search.js'
import { needsRestock, sortByUrgency } from '../lib/inventoryUi.js'
import { useAuthStore } from '../store/authStore.js'
import { useFieldErrors } from '../hooks/useFieldErrors.js'
import Modal from './Modal.jsx'
import FieldError from './FieldError.jsx'
import FormError from './FormError.jsx'
import { useToast } from './Toast.jsx'
import PageHeader from './PageHeader.jsx'
import ProductThumb from './ProductThumb.jsx'
import Select from './Select.jsx'
import StockEntryRow from './inventory/StockEntryRow.jsx'
import ReceiveDrawer from './inventory/ReceiveDrawer.jsx'
import MovementsLog from './inventory/MovementsLog.jsx'
import { getStockStatus, STOCK_STATUS } from '../lib/stockStatus.js'

const STATUS_ICON = { untracked: Package, out_of_stock: XCircle, low_stock: AlertTriangle, in_stock: CheckCircle2 }

export default function InventarioTab({ locations: allLocations = [], isOwner = false }) {
  const { error: toastError } = useToast()
  const authLocation = useAuthStore(s => s.location)

  // Solo los puntos con inventario configurado (Locaciones → Inventario); el resto no tiene qué mostrar aquí
  const locations = useMemo(() => allLocations.filter(l => l.inventory_active), [allLocations])
  const adminPointOff = !isOwner && allLocations.length > 0 && locations.length === 0

  // Admin: fijo en su punto (sin selector). Owner: el punto elegido ('' = consolidado).
  const [pickedLocationId, setPickedLocationId] = useState('')
  const locationId = isOwner ? (locations.some(l => l.id === pickedLocationId) ? pickedLocationId : '') :(authLocation?.id || locations[0]?.id || '')
  const activeLocation = locations.find(l => l.id === locationId)

  const [view, setView] = useState('stock') // 'stock' | 'movements'
  const [query, setQuery] = useState('')
  const [filterType, setFilterType] = useState(null) // null = elegir al cargar: 'restock' si hay pendientes, si no 'all'
  const [inventory, setInventory] = useState([])
  const [loading, setLoading] = useState(true)
  const [adjustItem, setAdjustItem] = useState(null)
  const [entryId, setEntryId] = useState(null)   // fila con el panel de reposición/merma abierto
  const [receiving, setReceiving] = useState(false)

  const fetchInventory = useCallback(() => {
    setLoading(true)
    const params = new URLSearchParams()
    if (locationId) params.set('location_id', locationId)

    return api.get(`/inventory?${params.toString()}`)
      .then(res => setInventory(res || []))
      .catch(err => toastError(err.message || 'Error cargando inventario'))
      .finally(() => setLoading(false))
  }, [locationId, toastError])

  useEffect(() => { fetchInventory() }, [fetchInventory])

  // La primera vez que llegan datos, la cola "Por reponer" es la vista inicial si tiene algo
  useEffect(() => {
    if (!loading && filterType === null) setFilterType(inventory.some(needsRestock) ? 'restock' : 'all')
  }, [loading, filterType, inventory])

  const canRestockHere = Boolean(locationId)

  const counts = useMemo(() => ({
    total: inventory.length,
    units: inventory.reduce((sum, i) => sum + Number(i.stock_quantity || 0), 0),
    restock: inventory.filter(needsRestock).length,
    low: inventory.filter(i => getStockStatus(i) === 'low_stock').length,
    out: inventory.filter(i => getStockStatus(i) === 'out_of_stock').length,
    available: inventory.filter(i => ['in_stock', 'low_stock'].includes(getStockStatus(i))).length,
  }), [inventory])

  // Filtrado y orden: agotados y con stock bajo siempre arriba
  const filtered = useMemo(() => {
    const active = filterType ?? 'all'
    return sortByUrgency(inventory.filter(item => {
      if (query.trim() && !matchesQuery([item.name, item.categories?.name], query)) return false
      const status = getStockStatus(item)
      if (active === 'restock') return needsRestock(item)
      if (active === 'low') return status === 'low_stock'
      if (active === 'out') return status === 'out_of_stock'
      if (active === 'in_stock') return status === 'in_stock' || status === 'low_stock'
      return true
    }))
  }, [inventory, query, filterType])

  const handleExport = () => {
    if (inventory.length === 0) return
    const rows = filtered.map(item => ({
      Producto: item.name,
      Categoría: item.categories?.name || 'Sin categoría',
      'Stock Actual': Number(item.stock_quantity || 0),
      Estado: STOCK_STATUS[getStockStatus(item)].label,
      'Última Actualización': item.stock_updated_at ? new Date(item.stock_updated_at).toLocaleString('es-CO') : 'Sin registro'
    }))
    const suffix = activeLocation ? `_${activeLocation.name.toLowerCase().replace(/\s+/g, '_')}` : '_consolidado'
    exportToExcel([{ name: 'Inventario', rows }], `inventario${suffix}_${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  const afterMovement = () => { setEntryId(null); fetchInventory() }

  const filterBtn = (id, label, count, tone) => (
    <button
      key={id} type="button" onClick={() => setFilterType(id)} aria-pressed={(filterType ?? 'all') === id}
      className={`btn btn-sm text-xs py-1 px-3 ${(filterType ?? 'all') === id ? tone.on : 'btn-ghost text-gray-400'}`}
    >
      {label} <span className="ml-1 font-mono tabular-nums opacity-80">{count}</span>
    </button>
  )

  if (adminPointOff || (isOwner && allLocations.length > 0 && locations.length === 0)) {
    return (
      <div className="card bg-surface-400 text-center py-10">
        <Package className="w-10 h-10 text-gray-500 mx-auto mb-2" />
        <p className="text-sm text-gray-300">Ningún punto controla inventario</p>
        <p className="text-xs text-gray-500 mt-1">
          {isOwner ? 'Actívalo en Locaciones → editar punto → Inventario.' : 'Pídele al propietario que active el inventario en tu punto.'}
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Control de inventario"
        icon={Package}
        description={activeLocation ? `${activeLocation.name} · existencias con descuento automático en ventas` : 'Existencias en tiempo real con descuento automático en ventas'}
        actions={<>
          {view === 'stock' && (
            <>
              <button type="button" onClick={fetchInventory} disabled={loading} className="btn-outline" title="Refrescar existencias">
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> <span>Refrescar</span>
              </button>
              <button type="button" onClick={handleExport} disabled={inventory.length === 0} className="btn-outline" title="Exportar a Excel">
                <FileSpreadsheet className="w-4 h-4 text-emerald-400" /> <span>Exportar Excel</span>
              </button>
            </>
          )}
          <button
            type="button" onClick={() => setReceiving(true)} disabled={!canRestockHere || loading}
            title={canRestockHere ? 'Registrar una entrada de mercancía' : 'Elige un punto de venta para recibir mercancía'}
            className="btn btn-primary"
          >
            <PackagePlus className="w-4 h-4" /> <span>Recibir mercancía</span>
          </button>
        </>}
      />

      <div role="group" aria-label="Vista de inventario" className="segmented">
        <button type="button" aria-pressed={view === 'stock'} onClick={() => setView('stock')}>Existencias</button>
        <button type="button" aria-pressed={view === 'movements'} onClick={() => setView('movements')}>Movimientos</button>
      </div>

      {view === 'movements' ? (
        <MovementsLog locations={locations} isOwner={isOwner} fixedLocationId={locationId} />
      ) : (
        <>
          {/* Métricas compactas */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Metric label="Productos" value={counts.total} />
            <Metric label="Unidades en stock" value={counts.units.toLocaleString()} tone="text-brand-400" />
            <Metric label="Stock bajo" value={counts.low} tone="text-yellow-400" edge="border-l-yellow-400" />
            <Metric label="Agotados" value={counts.out} tone="text-red-400" edge="border-l-red-400" />
          </div>

          {/* Búsqueda, punto (solo superadmin) y cola */}
          <div className="card bg-surface-400 p-3 space-y-3">
            <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
              <div className="relative w-full sm:w-64">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text" aria-label="Buscar producto o categoría" placeholder="Buscar producto o categoría..."
                  value={query} onChange={e => setQuery(e.target.value)} className="input pl-8 py-1.5 text-xs w-full"
                />
              </div>

              {isOwner && locations.length > 0 && (
                <div className="flex items-center gap-1.5 w-full sm:w-auto">
                  <MapPin className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                  <Select
                    aria-label="Punto de venta" value={pickedLocationId}
                    onChange={(v) => { setPickedLocationId(v); setEntryId(null) }}
                    className="w-full py-1.5 text-xs sm:w-48"
                    options={[{ value: '', label: 'Todos los puntos (consolidado)' }, ...locations.map(loc => ({ value: loc.id, label: loc.name }))]}
                  />
                </div>
              )}
            </div>

            <div className="flex flex-wrap gap-1.5 pt-1 border-t border-white/5">
              {filterBtn('restock', 'Por reponer', counts.restock, { on: 'bg-yellow-400/20 text-yellow-300 border border-yellow-400/30' })}
              {filterBtn('all', 'Todos', counts.total, { on: 'btn-primary' })}
              {filterBtn('in_stock', 'Disponibles', counts.available, { on: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' })}
              {filterBtn('low', 'Stock bajo', counts.low, { on: 'bg-yellow-400/20 text-yellow-300 border border-yellow-400/30' })}
              {filterBtn('out', 'Agotados', counts.out, { on: 'bg-red-400/20 text-red-300 border border-red-400/30' })}
            </div>
          </div>

          {!canRestockHere && (
            <p className="rounded-lg border border-white/10 bg-surface-400 px-3 py-2 text-xs text-gray-400">
              Estás viendo el consolidado. Elige un punto de venta para reponer o registrar mermas.
            </p>
          )}

          {/* Tabla */}
          {loading && inventory.length === 0 ? (
            <div className="space-y-2">{[1, 2, 3, 4, 5].map(i => <div key={i} className="skeleton h-12 rounded-lg" />)}</div>
          ) : filtered.length === 0 ? (
            <div className="card bg-surface-400 text-center py-10">
              <Package className="w-10 h-10 text-gray-500 mx-auto mb-2" />
              <p className="text-sm text-gray-300">
                {filterType === 'restock' && !query ? 'Nada por reponer: todo el inventario está en niveles normales' : 'No se encontraron productos en el inventario'}
              </p>
              <p className="text-xs text-gray-400 mt-1">
                {query ? 'Prueba cambiando el término de búsqueda' : filterType === 'restock' ? 'Cambia a "Todos" para ver el inventario completo' : 'Carga productos desde el catálogo o la importación Excel'}
              </p>
            </div>
          ) : (
            <div className="card bg-surface-300 p-0 overflow-hidden">
              <div className="relative overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-white/5 bg-surface-400 text-gray-400 font-medium">
                      <th className="py-2.5 px-3">Producto</th>
                      <th className="py-2.5 px-3 text-right">Stock</th>
                      <th className="py-2.5 px-3">Estado</th>
                      <th className="py-2.5 px-3 text-right">Acción</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {filtered.map(item => {
                      const qty = Number(item.stock_quantity || 0)
                      const status = getStockStatus(item)
                      const StatusIcon = STATUS_ICON[status]
                      const tracked = status !== 'untracked'
                      const open = entryId === item.id

                      return (
                        <Fragment key={item.id}>
                          <tr className={`transition-colors hover:bg-surface-400/50 ${open ? 'bg-surface-400/40' : ''}`}>
                            <td className="py-2 px-3">
                              <div className="flex items-center gap-2.5">
                                <ProductThumb
                                  src={item.image_url} alt={item.name} className="w-8 h-8 rounded-lg"
                                  fallback={<span className="w-8 h-8 rounded-lg bg-surface-200 flex items-center justify-center text-sm shrink-0">🎆</span>}
                                />
                                <div className="min-w-0">
                                  <p className="font-medium text-white truncate">{item.name}</p>
                                  <p className="text-2xs text-gray-400 truncate">{item.categories?.name || 'Sin categoría'}</p>
                                </div>
                              </div>
                            </td>
                            <td className="py-2 px-3 text-right">
                              <span className="font-mono tabular-nums text-sm font-bold text-white">{tracked ? qty.toLocaleString() : '—'}</span>
                            </td>
                            <td className="py-2 px-3">
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-2xs font-medium ${STOCK_STATUS[status].badge}`}>
                                <StatusIcon className="w-3 h-3" />
                                {status === 'untracked' ? 'Sin control en este punto' : STOCK_STATUS[status].label}
                                {status === 'low_stock' && <span className="font-mono tabular-nums">({qty} ≤ {item.low_stock_threshold})</span>}
                              </span>
                            </td>
                            <td className="py-2 px-3">
                              <div className="flex items-center justify-end gap-1.5">
                                {tracked && canRestockHere && (
                                  <button
                                    type="button" onClick={() => setEntryId(open ? null : item.id)} aria-expanded={open}
                                    className="btn btn-sm text-xs py-1 px-2.5 bg-brand-500/15 text-brand-300 border border-brand-500/30 hover:bg-brand-500/25 inline-flex items-center gap-1"
                                  >
                                    <Plus className="w-3 h-3" /> <span>Reponer</span>
                                  </button>
                                )}
                                {/* Conteo físico: solo superadministrador */}
                                {isOwner && tracked && (
                                  <button
                                    type="button" onClick={() => setAdjustItem(item)}
                                    className="btn btn-ghost btn-sm text-xs py-1 px-2.5 text-gray-300 border border-white/10 inline-flex items-center gap-1"
                                  >
                                    <Edit3 className="w-3 h-3" /> <span>Ajustar</span>
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                          {open && (
                            <tr>
                              <td colSpan={4} className="p-0">
                                <StockEntryRow item={item} locationId={locationId} onDone={afterMovement} onCancel={() => setEntryId(null)} />
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {receiving && (
        <ReceiveDrawer
          items={inventory} locationId={locationId} locationName={activeLocation?.name || 'este punto'}
          onClose={() => setReceiving(false)}
          onDone={(complete) => { fetchInventory(); if (complete) setReceiving(false) }}
        />
      )}

      {adjustItem && (
        <StockAdjustModal
          product={adjustItem}
          locations={locations}
          defaultLocationId={locationId}
          onClose={() => setAdjustItem(null)}
          onSuccess={() => {
            clearProductsCache()
            fetchInventory()
            setAdjustItem(null)
          }}
        />
      )}
    </div>
  )
}

function Metric({ label, value, tone = 'text-white', edge = '' }) {
  return (
    <div className={`card bg-surface-400 py-2.5 px-3 ${edge ? `border-l-2 ${edge}` : ''}`}>
      <p className={`font-mono tabular-nums font-bold text-xl text-right ${tone}`}>{value}</p>
      <p className="text-2xs text-gray-400">{label}</p>
    </div>
  )
}

function StockAdjustModal({ product, locations = [], defaultLocationId, onClose, onSuccess }) {
  const { success: toastSuccess } = useToast()
  const fid = useId()
  const { errors, validate, clear, describe } = useFieldErrors(fid)

  const [locationId, setLocationId] = useState(defaultLocationId || locations[0]?.id || '')
  const [newStock, setNewStock] = useState(String(product?.stock_quantity ?? '0'))
  const [reason, setReason] = useState('manual_adjustment')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  const handleSave = async () => {
    setSaveError('')
    const qty = Number(newStock)
    const ok = validate({
      location: !locationId && 'Selecciona un punto de venta',
      stock: (newStock === '' || !Number.isInteger(qty) || qty < 0) && 'Debe ser un número entero mayor o igual a 0',
    })
    if (!ok) return

    setSaving(true)
    try {
      await api.post('/inventory/adjust', {
        product_id: product.id,
        location_id: locationId,
        quantity: qty,
        reason,
        notes: notes.trim() || undefined,
      })
      toastSuccess(`Stock de "${product.name}" actualizado a ${qty}`)
      onSuccess()
    } catch (err) {
      setSaveError(err.message || 'Error al ajustar el inventario')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      title="Ajustar stock"
      description={product.name}
      icon={Package}
      onClose={onClose}
      onSubmit={handleSave}
      footer={<>
        <button type="button" onClick={onClose} className="btn btn-ghost">Cancelar</button>
        <button type="submit" disabled={saving} className="btn btn-primary">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          <span>{saving ? 'Guardando...' : 'Guardar ajuste'}</span>
        </button>
      </>}
    >
      {/* Selector de punto si hay varios */}
      {locations.length > 0 && (
        <div>
          <label htmlFor={`${fid}-location`} className="field-label">Punto de venta</label>
          <Select
            id={`${fid}-location`}
            value={locationId}
            {...describe('location')}
            onChange={v => { setLocationId(v); clear('location') }}
            options={locations.map(loc => ({ value: loc.id, label: loc.name }))}
          />
          <FieldError id={`${fid}-location-error`}>{errors.location}</FieldError>
        </div>
      )}

      {/* Cantidad nueva */}
      <div>
        <label htmlFor={`${fid}-stock`} className="field-label">Nuevo stock disponible</label>
        <input
          id={`${fid}-stock`}
          type="number"
          min="0"
          step="1"
          inputMode="numeric"
          value={newStock}
          {...describe('stock')}
          onChange={e => { setNewStock(e.target.value); clear('stock') }}
          className="input font-mono text-base"
          placeholder="0"
          autoFocus
        />
        <FieldError id={`${fid}-stock-error`}>{errors.stock}</FieldError>
      </div>

      {/* Motivo */}
      <div>
        <label htmlFor={`${fid}-reason`} className="field-label">Motivo del ajuste</label>
        <Select
          id={`${fid}-reason`}
          value={reason}
          onChange={setReason}
          options={[
            { value: 'manual_adjustment', label: 'Ajuste manual / conteo físico' },
            { value: 'initial_load', label: 'Carga o reposición de mercancía' },
            { value: 'damage', label: 'Merma o producto dañado' },
            { value: 'transfer', label: 'Traslado entre sedes' },
          ]}
        />
      </div>

      {/* Notas */}
      <div>
        <label htmlFor={`${fid}-notes`} className="field-label">Notas u observaciones <span className="font-normal">(opcional)</span></label>
        <input
          id={`${fid}-notes`}
          type="text"
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Ej: Conteo fin de mes, lote nuevo..."
          className="input"
        />
      </div>

      <FormError message={saveError} />
    </Modal>
  )
}
