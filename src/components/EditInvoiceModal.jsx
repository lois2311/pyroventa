import { useState, useEffect, useMemo, useId } from 'react'
import { Plus, X, Pencil, RotateCcw } from 'lucide-react'
import { api, getProductsCache } from '../lib/api.js'
import { formatCOP } from '../lib/format.js'
import { useAuthStore } from '../store/authStore.js'
import { useApi } from '../hooks/useApi.js'
import { useToast } from './Toast.jsx'
import Modal from './Modal.jsx'
import ErrorNotice from './ErrorNotice.jsx'
import ProductImage from './ProductImage.jsx'
import FormError from './FormError.jsx'
import { stockCap } from '../lib/stockStatus.js'

const COMMON_REASONS = [
  'Descuento por volumen',
  'Cliente frecuente / Mayorista',
  'Empaque o producto con detalle',
  'Negociación autorizada',
  'Cortesía / Promoción',
]

export default function EditInvoiceModal({ invoice, productImages = {}, onClose, onSaved }) {
  const { location, seller, tenant } = useAuthStore()
  const isOwner = seller?.role === 'owner'
  const hasInventory = Boolean(tenant?.has_inventory)
  const { success: toastSuccess } = useToast()

  const [items,        setItems]        = useState([])
  const [query,        setQuery]        = useState('')
  const [saving,       setSaving]       = useState(false)
  const [saveError,    setSaveError]    = useState('')
  const [showCatalog,  setShowCatalog]  = useState(false)
  const [editingPriceIdx, setEditingPriceIdx] = useState(null)

  // Catálogo: para agregar productos y para conocer el stock. Casi siempre
  // está en caché (Caja lo carga para las fotos); si no, se pide y un fallo
  // se muestra con reintento en vez de dejar la búsqueda vacía.
  const cachedCatalog = useMemo(() => getProductsCache(location?.id), [location?.id])
  const catalogQ = useApi(!cachedCatalog && location?.id ? `/products?location_id=${location.id}` : null, { initialData: [] })
  const products = useMemo(() => cachedCatalog || catalogQ.data || [], [cachedCatalog, catalogQ.data])

  // Con inventario, subir cantidades o agregar no puede pasar del stock del
  // producto (la factura está pendiente: su stock aún no se descontó). Bajar
  // siempre se puede, aunque la factura ya viniera por encima del stock.
  const stockOf = (productId) => {
    if (!hasInventory) return Infinity
    const p = products.find(x => x.id === productId)
    return p ? (stockCap(p) ?? Infinity) : Infinity
  }
  const qtyOfProduct = (productId) => items.reduce((n, i) => (i.productId === productId ? n + i.qty : n), 0)
  const canAddUnit = (productId) => qtyOfProduct(productId) < stockOf(productId)

  // Inicializar items desde la factura
  useEffect(() => {
    if (!invoice?.items) return
    const parsed = Array.isArray(invoice.items) ? invoice.items : []
    setItems(parsed.map(item => {
      const base = item.original_price ?? item.base_price ?? item.price
      return {
        presentationId:    item.presentationId,
        productId:         item.productId,
        product_name:      item.product_name || item.productName || item.label,
        label:             item.label,
        base_price:        base,
        original_price:    base,
        price:             item.price,
        is_price_edited:   !!item.is_price_edited,
        price_edit_reason: item.price_edit_reason || '',
        qty:               item.qty,
        subtotal:          item.price * item.qty,
      }
    }))
  }, [invoice])

  // ---- Acciones sobre items ----
  const updateQty = (idx, newQty) => {
    setSaveError('')
    if (newQty <= 0) {
      setItems(prev => prev.filter((_, i) => i !== idx))
    } else {
      setItems(prev => prev.map((item, i) =>
        i === idx ? { ...item, qty: newQty, subtotal: item.price * newQty } : item
      ))
    }
  }

  const removeItem = (idx) => {
    setSaveError('')
    setItems(prev => prev.filter((_, i) => i !== idx))
  }

  const updateItemPrice = (idx, newPrice, reason) => {
    const num = Math.round(Number(newPrice) * 100) / 100
    if (!Number.isFinite(num) || num < 0) return
    setItems(prev => prev.map((item, i) => {
      if (i !== idx) return item
      const base = item.base_price ?? item.original_price ?? item.price
      const isEdited = num !== base
      return {
        ...item,
        price:             num,
        is_price_edited:   isEdited,
        price_edit_reason: isEdited ? (reason?.trim() || '') : '',
        subtotal:          num * item.qty,
      }
    }))
    setEditingPriceIdx(null)
  }

  const resetItemPrice = (idx) => {
    setItems(prev => prev.map((item, i) => {
      if (i !== idx) return item
      const base = item.base_price ?? item.original_price ?? item.price
      return {
        ...item,
        price:             base,
        is_price_edited:   false,
        price_edit_reason: '',
        subtotal:          base * item.qty,
      }
    }))
    setEditingPriceIdx(null)
  }

  const addFromCatalog = (product, pres) => {
    if (!canAddUnit(product.id)) return
    setSaveError('')
    const existIdx = items.findIndex(i => i.presentationId === pres.id && !i.is_price_edited)
    if (existIdx >= 0) {
      updateQty(existIdx, items[existIdx].qty + 1)
    } else {
      const presPrice = Number(pres.price) || 0
      setItems(prev => [...prev, {
        presentationId:    pres.id,
        productId:         product.id,
        product_name:      product.name,
        label:             pres.label,
        base_price:        presPrice,
        original_price:    presPrice,
        price:             presPrice,
        is_price_edited:   false,
        price_edit_reason: '',
        qty:               1,
        subtotal:          presPrice,
      }])
    }
    setShowCatalog(false)
    setQuery('')
  }

  const total = items.reduce((sum, i) => sum + i.subtotal, 0)

  // Filtrar catálogo
  const filteredProducts = useMemo(() => {
    if (!query.trim()) return products.slice(0, 20)
    const q = query.toLowerCase().trim()
    return products.filter(p => p.name.toLowerCase().includes(q)).slice(0, 20)
  }, [products, query])

  // ---- Guardar ----
  const handleSave = async () => {
    if (items.length === 0) return setSaveError('La factura debe tener al menos 1 ítem')
    setSaving(true)
    setSaveError('')
    try {
      const updated = await api.post(`/invoices/${invoice.code}/edit`, {
        location_id: location.id,
        items: items.map(i => ({
          presentationId:    i.presentationId,
          productId:         i.productId,
          product_name:      i.product_name,
          label:             i.label,
          price:             i.price,
          original_price:    i.original_price ?? i.base_price ?? i.price,
          is_price_edited:   !!i.is_price_edited,
          price_edit_reason: i.price_edit_reason || undefined,
          qty:               i.qty,
          subtotal:          i.subtotal,
        })),
      })
      toastSuccess('Factura actualizada')
      onSaved(updated)
    } catch (err) {
      setSaveError(err.message || 'Error al editar la factura')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      title={<>Editar factura <span className="text-brand-400">#{invoice?.code}</span></>}
      description={`Vendedor: ${invoice?.seller_name || '—'}`}
      icon={Pencil}
      size="lg"
      onClose={onClose}
      onSubmit={handleSave}
      // Un toque fuera no descarta los cambios (Escape y la X sí cierran)
      closeOnBackdrop={false}
      footer={<>
        <button type="button" onClick={onClose} className="btn btn-ghost">Cancelar</button>
        <button type="submit" disabled={saving || items.length === 0} className="btn btn-primary">
          {saving ? 'Guardando...' : 'Guardar cambios'}
        </button>
      </>}
    >
      {/* Lista de items editables */}
      <ul className="max-h-[45vh] space-y-1.5 overflow-y-auto">
        {items.length === 0 ? (
          <li className="py-4 text-center text-sm text-gray-400">Sin ítems. Agrega productos del catálogo.</li>
        ) : items.map((item, idx) => {
          const atCap = !canAddUnit(item.productId)
          const stock = stockOf(item.productId)
          return (
            <li key={idx} className="space-y-1.5 rounded-lg bg-surface-400 px-3 py-2">
              <div className="flex items-center gap-2">
                <ProductImage src={productImages[item.productId]} name={item.product_name} className="h-8 w-8 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-white">{item.product_name}</p>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <p className="text-2xs text-gray-400">{item.label} · <span className="font-mono tabular-nums">{formatCOP(item.price)}</span> c/u</p>
                    {item.is_price_edited && (
                      <span className="rounded border border-amber-500/30 bg-amber-500/20 px-1.5 text-2xs font-medium text-amber-300">
                        Editado (Base: {formatCOP(item.original_price)})
                      </span>
                    )}
                    {atCap && Number.isFinite(stock) && (
                      <span className="text-2xs text-amber-300">{stock <= 0 ? 'Agotado' : `Solo quedan ${stock}`}</span>
                    )}
                  </div>
                  {item.is_price_edited && item.price_edit_reason && (
                    <p className="truncate text-2xs italic text-gray-400">
                      Motivo: {item.price_edit_reason}
                    </p>
                  )}
                </div>

                {/* Botón editar precio (solo superadministrador) */}
                {isOwner && (
                  <button
                    type="button"
                    onClick={() => setEditingPriceIdx(editingPriceIdx === idx ? null : idx)}
                    title="Editar precio del artículo (Superadmin)"
                    aria-label={`Editar precio de ${item.product_name}`}
                    aria-expanded={editingPriceIdx === idx}
                    className={`flex h-7 w-7 items-center justify-center rounded-md transition-colors ${
                      editingPriceIdx === idx ? 'bg-brand-500 text-surface-700' : 'text-gray-400 hover:bg-surface-100 hover:text-brand-400'
                    }`}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                )}

                {/* Controles cantidad */}
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => updateQty(idx, item.qty - 1)}
                    aria-label={`Quitar una unidad de ${item.product_name}`}
                    className="flex h-7 w-7 items-center justify-center rounded-md bg-surface-50 text-sm text-gray-400 transition-colors hover:bg-surface-100 hover:text-white"
                  >
                    −
                  </button>
                  <span className="w-7 text-center font-mono text-sm font-semibold text-white">{item.qty}</span>
                  <button
                    type="button"
                    onClick={() => updateQty(idx, item.qty + 1)}
                    disabled={atCap}
                    aria-label={`Agregar una unidad de ${item.product_name}`}
                    className="flex h-7 w-7 items-center justify-center rounded-md bg-surface-50 text-sm text-gray-400 transition-colors hover:bg-brand-500/30 hover:text-brand-400 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-surface-50 disabled:hover:text-gray-400"
                  >
                    +
                  </button>
                </div>

                <span className="w-20 shrink-0 text-right font-mono text-xs font-semibold text-brand-400">
                  {formatCOP(item.subtotal)}
                </span>

                <button
                  type="button"
                  onClick={() => removeItem(idx)}
                  className="-m-1 ml-0.5 p-1.5 text-gray-400 transition-colors hover:text-red-400"
                  aria-label={`Quitar ${item.product_name}`}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* Panel de edición de precio inline (solo superadministrador) */}
              {isOwner && editingPriceIdx === idx && (
                <InlinePriceEditor
                  item={item}
                  onSave={(newPrice, reason) => updateItemPrice(idx, newPrice, reason)}
                  onReset={() => resetItemPrice(idx)}
                  onCancel={() => setEditingPriceIdx(null)}
                />
              )}
            </li>
          )
        })}
      </ul>

      {/* Botón agregar producto */}
      {!showCatalog ? (
        <button
          type="button"
          onClick={() => setShowCatalog(true)}
          className="btn-outline w-full border-dashed text-gray-400 hover:border-brand-500/30 hover:text-brand-400"
        >
          <Plus className="h-4 w-4" /> Agregar producto
        </button>
      ) : (
        <div className="space-y-2 rounded-xl border border-white/5 bg-surface-400 p-3">
          <div className="flex items-center gap-2">
            <input
              type="search"
              placeholder="Buscar producto..."
              aria-label="Buscar producto para agregar"
              value={query}
              onChange={e => setQuery(e.target.value)}
              // Enter en la búsqueda no debe guardar la factura
              onKeyDown={e => { if (e.key === 'Enter') e.preventDefault() }}
              className="input flex-1 text-sm"
              autoFocus
            />
            <button
              type="button"
              onClick={() => { setShowCatalog(false); setQuery('') }}
              className="-m-1 shrink-0 p-2 text-gray-400 hover:text-white"
              aria-label="Cerrar búsqueda"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          {catalogQ.error ? (
            <ErrorNotice error={catalogQ.error} title="No se pudo cargar el catálogo" onRetry={catalogQ.refetch} />
          ) : catalogQ.loading && !products.length ? (
            <div className="space-y-1">{[1, 2, 3].map(i => <div key={i} className="skeleton h-8 rounded-md" />)}</div>
          ) : (
            <div className="max-h-48 space-y-1 overflow-y-auto">
              {filteredProducts.map(product => {
                const soldOut = !canAddUnit(product.id)
                return (
                  <div key={product.id} className="space-y-0.5">
                    <div className="flex items-center gap-1.5 px-1">
                      {product.image_url && <ProductImage src={product.image_url} name={product.name} className="h-6 w-6" />}
                      <p className="text-2xs font-medium text-gray-400">{product.name}</p>
                      {soldOut && <span className="text-2xs text-amber-300">· {stockOf(product.id) <= 0 ? 'Agotado' : 'Sin más stock'}</span>}
                    </div>
                    {(product.presentations || []).filter(p => p.active !== false).map(pres => (
                      <button
                        key={pres.id}
                        type="button"
                        onClick={() => addFromCatalog(product, pres)}
                        disabled={soldOut}
                        className="flex w-full items-center justify-between rounded-md bg-surface-300 px-2 py-1.5 text-xs text-gray-300 transition-colors hover:bg-surface-200 hover:text-white disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-surface-300 disabled:hover:text-gray-300"
                      >
                        <span>{pres.label}</span>
                        <span className="font-mono text-brand-400">{formatCOP(pres.price)}</span>
                      </button>
                    ))}
                  </div>
                )
              })}
              {filteredProducts.length === 0 && (
                <p className="py-3 text-center text-xs text-gray-400">Sin resultados</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Total */}
      <div className="flex items-center justify-between border-t border-white/5 pt-3">
        <span className="text-sm font-medium text-gray-400">Nuevo total</span>
        <span className="font-mono text-xl font-bold text-white">{formatCOP(total)}</span>
      </div>

      <FormError message={saveError} />
    </Modal>
  )
}

function InlinePriceEditor({ item, onSave, onReset, onCancel }) {
  const fid = useId()
  const basePrice = item.original_price ?? item.base_price ?? item.price
  const [priceStr, setPriceStr] = useState(String(item.price))
  const [reason,   setReason]   = useState(item.price_edit_reason || '')
  const [err,      setErr]      = useState('')

  const handleApply = (e) => {
    e?.preventDefault()
    const num = Number(priceStr)
    if (!Number.isFinite(num) || num < 0) {
      setErr('Precio inválido')
      return
    }
    onSave(num, reason)
  }

  // Enter aplica el precio (no envía el formulario de la factura)
  const applyOnEnter = (e) => { if (e.key === 'Enter') handleApply(e) }

  return (
    <div className="space-y-2 rounded-lg border border-brand-500/30 bg-surface-300 p-2.5 text-xs">
      <div className="flex items-center justify-between">
        <span className="text-gray-400">Precio base: <strong className="font-mono text-white">{formatCOP(basePrice)}</strong></span>
        {item.is_price_edited && (
          <button
            type="button"
            onClick={onReset}
            className="inline-flex items-center gap-1 text-2xs text-amber-400 hover:text-amber-300"
          >
            <RotateCcw className="h-3 w-3" /> Restablecer
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div>
          <label htmlFor={`${fid}-price`} className="mb-0.5 block text-2xs text-gray-400">Nuevo precio unitario</label>
          <input
            id={`${fid}-price`}
            type="number"
            min="0"
            step="100"
            value={priceStr}
            onChange={e => { setPriceStr(e.target.value); setErr('') }}
            onKeyDown={applyOnEnter}
            aria-invalid={err ? true : undefined}
            aria-describedby={err ? `${fid}-price-error` : undefined}
            className="input w-full font-mono text-xs font-bold"
            autoFocus
          />
        </div>
        <div>
          <label htmlFor={`${fid}-reason`} className="mb-0.5 block text-2xs text-gray-400">Motivo del cambio</label>
          <input
            id={`${fid}-reason`}
            type="text"
            placeholder="Ej: Descuento acordado..."
            value={reason}
            onChange={e => setReason(e.target.value)}
            onKeyDown={applyOnEnter}
            className="input w-full text-xs"
          />
        </div>
      </div>

      {err && <p id={`${fid}-price-error`} className="text-2xs text-red-400">{err}</p>}

      <div className="flex flex-wrap gap-1">
        {COMMON_REASONS.slice(0, 3).map(r => (
          <button
            key={r}
            type="button"
            onClick={() => setReason(r)}
            aria-pressed={reason === r}
            className="rounded bg-surface-400 px-1.5 py-0.5 text-2xs text-gray-300 transition-colors hover:bg-surface-200"
          >
            {r}
          </button>
        ))}
      </div>

      <div className="flex justify-end gap-1.5 pt-1">
        <button type="button" onClick={onCancel} className="btn btn-ghost btn-sm px-2 py-1 text-2xs">
          Cancelar
        </button>
        <button type="button" onClick={handleApply} className="btn btn-primary btn-sm px-2 py-1 text-2xs">
          Aplicar precio
        </button>
      </div>
    </div>
  )
}
