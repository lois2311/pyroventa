import { useState, useEffect, useCallback, useId } from 'react'
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
  Tag,
  Loader2,
  Check,
  X
} from 'lucide-react'
import { api, clearProductsCache } from '../lib/api.js'
import { exportToExcel } from '../lib/exportExcel.js'
import { useModalA11y } from '../hooks/useModalA11y.js'
import { useToast } from './Toast.jsx'

export default function InventarioTab({ locations = [], isOwner = false }) {
  const { error: toastError, success: toastSuccess } = useToast()

  const [locationId, setLocationId] = useState('')
  const [query, setQuery] = useState('')
  const [filterType, setFilterType] = useState('all') // 'all' | 'low' | 'out' | 'in_stock'
  const [inventory, setInventory] = useState([])
  const [loading, setLoading] = useState(true)
  const [adjustItem, setAdjustItem] = useState(null)

  const fetchInventory = useCallback(() => {
    setLoading(true)
    const params = new URLSearchParams()
    if (locationId) params.set('location_id', locationId)

    api.get(`/inventory?${params.toString()}`)
      .then(res => setInventory(res || []))
      .catch(err => toastError(err.message || 'Error cargando inventario'))
      .finally(() => setLoading(false))
  }, [locationId])

  useEffect(() => {
    fetchInventory()
  }, [fetchInventory])

  // Filtrado local por búsqueda y estado
  const filtered = inventory.filter(item => {
    if (query.trim()) {
      const q = query.toLowerCase().trim()
      const matchName = item.name?.toLowerCase().includes(q)
      const matchCat = item.categories?.name?.toLowerCase().includes(q)
      if (!matchName && !matchCat) return false
    }

    const qty = Number(item.stock_quantity || 0)
    if (filterType === 'low') return qty > 0 && qty <= 5
    if (filterType === 'out') return qty <= 0
    if (filterType === 'in_stock') return qty > 0
    return true
  })

  // Totales de métricas
  const totalProducts = inventory.length
  const totalUnits = inventory.reduce((sum, i) => sum + Number(i.stock_quantity || 0), 0)
  const lowStockCount = inventory.filter(i => Number(i.stock_quantity || 0) > 0 && Number(i.stock_quantity || 0) <= 5).length
  const outOfStockCount = inventory.filter(i => Number(i.stock_quantity || 0) <= 0).length

  const handleExport = () => {
    if (inventory.length === 0) return
    const exportData = filtered.map(item => ({
      Producto: item.name,
      Categoría: item.categories?.name || 'Sin categoría',
      'Stock Actual': Number(item.stock_quantity || 0),
      Estado: Number(item.stock_quantity || 0) <= 0
        ? 'Agotado'
        : Number(item.stock_quantity || 0) <= 5
        ? 'Stock Bajo'
        : 'Disponible',
      'Última Actualización': item.stock_updated_at ? new Date(item.stock_updated_at).toLocaleString('es-CO') : 'Sin registro'
    }))

    const activeLoc = locations.find(l => l.id === locationId)
    const locSuffix = activeLoc ? `_${activeLoc.name.toLowerCase().replace(/\s+/g, '_')}` : '_consolidado'
    exportToExcel(exportData, `inventario${locSuffix}_${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  return (
    <div className="space-y-4 max-w-5xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h2 className="font-syne font-semibold text-white flex items-center gap-2">
            <Package className="w-5 h-5 text-brand-400" />
            Control de Inventario
          </h2>
          <p className="text-xs text-gray-400 mt-0.5">
            Existencias en tiempo real con descuento automático en ventas
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={fetchInventory}
            disabled={loading}
            className="btn btn-ghost btn-sm text-xs flex items-center gap-1.5"
            title="Refrescar existencias"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refrescar</span>
          </button>
          <button
            onClick={handleExport}
            disabled={inventory.length === 0}
            className="btn btn-ghost border border-white/10 btn-sm text-xs flex items-center gap-1.5"
            title="Exportar a Excel"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
            <span>Exportar Excel</span>
          </button>
        </div>
      </div>

      {/* Tarjetas de métricas */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="card bg-surface-400 text-center py-3">
          <p className="font-mono font-bold text-xl text-white">{totalProducts}</p>
          <p className="text-[11px] text-gray-400">Total Productos</p>
        </div>
        <div className="card bg-surface-400 text-center py-3">
          <p className="font-mono font-bold text-xl text-brand-400">{totalUnits.toLocaleString()}</p>
          <p className="text-[11px] text-gray-400">Unidades en Stock</p>
        </div>
        <div className="card bg-surface-400 text-center py-3 border-l-2 border-yellow-500">
          <p className="font-mono font-bold text-xl text-yellow-400">{lowStockCount}</p>
          <p className="text-[11px] text-yellow-400/80">Stock Bajo (≤ 5)</p>
        </div>
        <div className="card bg-surface-400 text-center py-3 border-l-2 border-red-500">
          <p className="font-mono font-bold text-xl text-red-400">{outOfStockCount}</p>
          <p className="text-[11px] text-red-400/80">Agotados (0)</p>
        </div>
      </div>

      {/* Filtros y Selector de Punto */}
      <div className="card bg-surface-400 p-3 space-y-3">
        <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
          {/* Búsqueda */}
          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar producto o categoría..."
              value={query}
              onChange={e => setQuery(e.target.value)}
              className="input pl-8 py-1.5 text-xs w-full"
            />
          </div>

          {/* Selector de Punto (si es owner o hay múltiples) */}
          {isOwner && locations.length > 0 && (
            <div className="flex items-center gap-1.5 w-full sm:w-auto">
              <MapPin className="w-3.5 h-3.5 text-gray-400 shrink-0" />
              <select
                value={locationId}
                onChange={e => setLocationId(e.target.value)}
                className="input py-1.5 text-xs bg-surface-300 text-white w-full sm:w-48"
              >
                <option value="">🏢 Todos los puntos (Consolidado)</option>
                {locations.map(loc => (
                  <option key={loc.id} value={loc.id}>
                    📍 {loc.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Botones de filtro rápido */}
        <div className="flex flex-wrap gap-1.5 pt-1 border-t border-white/5">
          <button
            onClick={() => setFilterType('all')}
            className={`btn btn-sm text-xs py-1 px-3 ${filterType === 'all' ? 'btn-primary' : 'btn-ghost'}`}
          >
            Todos ({inventory.length})
          </button>
          <button
            onClick={() => setFilterType('in_stock')}
            className={`btn btn-sm text-xs py-1 px-3 ${filterType === 'in_stock' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'btn-ghost text-gray-400'}`}
          >
            <CheckCircle2 className="w-3 h-3 text-emerald-400 inline mr-1" />
            Disponibles ({inventory.filter(i => Number(i.stock_quantity || 0) > 0).length})
          </button>
          <button
            onClick={() => setFilterType('low')}
            className={`btn btn-sm text-xs py-1 px-3 ${filterType === 'low' ? 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/30' : 'btn-ghost text-gray-400'}`}
          >
            <AlertTriangle className="w-3 h-3 text-yellow-400 inline mr-1" />
            Stock bajo ({lowStockCount})
          </button>
          <button
            onClick={() => setFilterType('out')}
            className={`btn btn-sm text-xs py-1 px-3 ${filterType === 'out' ? 'bg-red-500/20 text-red-300 border border-red-500/30' : 'btn-ghost text-gray-400'}`}
          >
            <XCircle className="w-3 h-3 text-red-400 inline mr-1" />
            Agotados ({outOfStockCount})
          </button>
        </div>
      </div>

      {/* Lista / Tabla de Inventario */}
      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="skeleton h-14 rounded-xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="card bg-surface-400 text-center py-10">
          <Package className="w-10 h-10 text-gray-500 mx-auto mb-2" />
          <p className="text-sm text-gray-300">No se encontraron productos en el inventario</p>
          <p className="text-xs text-gray-500 mt-1">
            {query ? 'Prueba cambiando el término de búsqueda' : 'Carga productos desde el catálogo o la importación Excel'}
          </p>
        </div>
      ) : (
        <div className="card bg-surface-300 p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-white/5 bg-surface-400 text-gray-400 font-medium">
                  <th className="py-2.5 px-3">Producto</th>
                  <th className="py-2.5 px-3">Categoría</th>
                  <th className="py-2.5 px-3 text-center">Stock Actual</th>
                  <th className="py-2.5 px-3 text-center">Estado</th>
                  <th className="py-2.5 px-3 text-right">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filtered.map(item => {
                  const qty = Number(item.stock_quantity || 0)
                  const isOut = qty <= 0
                  const isLow = qty > 0 && qty <= 5

                  return (
                    <tr key={item.id} className="hover:bg-surface-400/50 transition-colors">
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-2.5">
                          {item.image_url ? (
                            <img
                              src={item.image_url}
                              alt={item.name}
                              className="w-8 h-8 rounded-lg object-cover border border-white/10 shrink-0"
                            />
                          ) : (
                            <span className="w-8 h-8 rounded-lg bg-surface-200 flex items-center justify-center text-sm shrink-0">
                              🎆
                            </span>
                          )}
                          <div className="min-w-0">
                            <p className="font-medium text-white truncate">{item.name}</p>
                            {item.description && (
                              <p className="text-[10px] text-gray-400 truncate max-w-xs">{item.description}</p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-gray-400">
                        {item.categories?.name ? (
                          <span className="inline-flex items-center gap-1 bg-surface-200 px-2 py-0.5 rounded text-[11px]">
                            <Tag className="w-2.5 h-2.5 text-gray-500" />
                            {item.categories.name}
                          </span>
                        ) : (
                          <span className="text-gray-500 italic">—</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <span className="font-mono text-sm font-bold text-white">
                          {qty.toLocaleString()}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        {isOut ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-red-500/15 text-red-400 border border-red-500/20">
                            <XCircle className="w-3 h-3" />
                            Agotado
                          </span>
                        ) : isLow ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-yellow-500/15 text-yellow-400 border border-yellow-500/20">
                            <AlertTriangle className="w-3 h-3" />
                            Stock Bajo ({qty})
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
                            <CheckCircle2 className="w-3 h-3" />
                            Disponible
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <button
                          onClick={() => setAdjustItem(item)}
                          className="btn btn-ghost btn-sm text-xs py-1 px-2.5 text-brand-300 hover:text-brand-200 border border-brand-500/20 hover:bg-brand-500/10 inline-flex items-center gap-1"
                        >
                          <Edit3 className="w-3 h-3" />
                          <span>Ajustar</span>
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal de Ajuste de Stock */}
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

function StockAdjustModal({ product, locations = [], defaultLocationId, onClose, onSuccess }) {
  const { error: toastError, success: toastSuccess } = useToast()
  const titleId = useId()
  const panelRef = useModalA11y(onClose)

  const [locationId, setLocationId] = useState(defaultLocationId || locations[0]?.id || '')
  const [newStock, setNewStock] = useState(String(product?.stock_quantity ?? '0'))
  const [reason, setReason] = useState('manual_adjustment')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  const handleSave = async (e) => {
    e?.preventDefault()
    if (!locationId) return toastError('Selecciona un punto de venta')
    const qty = parseInt(newStock, 10)
    if (isNaN(qty) || qty < 0) return toastError('La cantidad debe ser un número entero mayor o igual a 0')

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
      toastError(err.message || 'Error al ajustar el inventario')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={onClose}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="card bg-surface-200 w-full max-w-md space-y-4 shadow-xl border border-white/10"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div>
            <h3 id={titleId} className="font-syne font-semibold text-white flex items-center gap-2">
              <Package className="w-4 h-4 text-brand-400" />
              Ajustar Stock
            </h3>
            <p className="text-xs text-gray-400 mt-0.5">{product.name}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white p-1">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSave} className="space-y-3">
          {/* Selector de punto si hay varios */}
          {locations.length > 0 && (
            <div>
              <label className="text-xs text-gray-400 block mb-1">Punto de venta</label>
              <select
                value={locationId}
                onChange={e => setLocationId(e.target.value)}
                className="input w-full text-xs bg-surface-300 text-white"
                required
              >
                {locations.map(loc => (
                  <option key={loc.id} value={loc.id}>
                    📍 {loc.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Cantidad nueva */}
          <div>
            <label className="text-xs text-gray-400 block mb-1">Nuevo stock disponible</label>
            <input
              type="number"
              min="0"
              step="1"
              value={newStock}
              onChange={e => setNewStock(e.target.value)}
              className="input w-full font-mono text-base py-2"
              placeholder="0"
              required
              autoFocus
            />
          </div>

          {/* Motivo */}
          <div>
            <label className="text-xs text-gray-400 block mb-1">Motivo del ajuste</label>
            <select
              value={reason}
              onChange={e => setReason(e.target.value)}
              className="input w-full text-xs bg-surface-300 text-white"
            >
              <option value="manual_adjustment">📝 Ajuste manual / Conteo físico</option>
              <option value="initial_load">📥 Carga o reposición de mercancía</option>
              <option value="damage">⚠️ Merma o producto dañado</option>
              <option value="transfer">🔄 Traslado entre sedes</option>
            </select>
          </div>

          {/* Notas */}
          <div>
            <label className="text-xs text-gray-400 block mb-1">Notas u observaciones (opcional)</label>
            <input
              type="text"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Ej: Conteo fin de mes, lote nuevo..."
              className="input w-full text-xs"
            />
          </div>

          <div className="flex gap-2 justify-end pt-3 border-t border-white/5">
            <button type="button" onClick={onClose} className="btn btn-ghost btn-sm text-xs">
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="btn btn-primary btn-sm text-xs flex items-center gap-1.5"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              <span>{saving ? 'Guardando...' : 'Guardar ajuste'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
