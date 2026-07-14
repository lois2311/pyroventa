import { useState, useEffect, useMemo } from 'react'
import { X } from 'lucide-react'
import { api, getProductsCache } from '../lib/api.js'
import { formatCOP } from '../lib/format.js'
import { useAuthStore } from '../store/authStore.js'
import { useToast } from './Toast.jsx'

export default function EditInvoiceModal({ invoice, onClose, onSaved }) {
  const { location } = useAuthStore()
  const { error: toastError, success: toastSuccess } = useToast()

  const [items,      setItems]      = useState([])
  const [products,   setProducts]   = useState([])
  const [query,      setQuery]      = useState('')
  const [saving,     setSaving]     = useState(false)
  const [showCatalog, setShowCatalog] = useState(false)

  // Inicializar items desde la factura
  useEffect(() => {
    if (!invoice?.items) return
    const parsed = Array.isArray(invoice.items) ? invoice.items : []
    setItems(parsed.map(item => ({
      presentationId: item.presentationId,
      productId:      item.productId,
      product_name:   item.product_name || item.label,
      label:          item.label,
      price:          item.price,
      qty:            item.qty,
      subtotal:       item.price * item.qty,
    })))
  }, [invoice])

  // Cargar catálogo para agregar nuevos productos
  useEffect(() => {
    if (!showCatalog || !location?.id) return
    const cached = getProductsCache(location.id)
    if (cached) {
      setProducts(cached)
      return
    }
    api.get(`/products?location_id=${location.id}`)
      .then(d => setProducts(d || []))
      .catch(() => {})
  }, [showCatalog, location?.id])

  // ---- Acciones sobre items ----
  const updateQty = (idx, newQty) => {
    if (newQty <= 0) {
      setItems(prev => prev.filter((_, i) => i !== idx))
    } else {
      setItems(prev => prev.map((item, i) =>
        i === idx ? { ...item, qty: newQty, subtotal: item.price * newQty } : item
      ))
    }
  }

  const removeItem = (idx) => {
    setItems(prev => prev.filter((_, i) => i !== idx))
  }

  const addFromCatalog = (product, pres) => {
    const existIdx = items.findIndex(i => i.presentationId === pres.id)
    if (existIdx >= 0) {
      updateQty(existIdx, items[existIdx].qty + 1)
    } else {
      setItems(prev => [...prev, {
        presentationId: pres.id,
        productId:      product.id,
        product_name:   product.name,
        label:          pres.label,
        price:          pres.price,
        qty:            1,
        subtotal:       pres.price,
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
    if (items.length === 0) return toastError('La factura debe tener al menos 1 item')
    setSaving(true)
    try {
      const updated = await api.post(`/invoices/${invoice.code}/edit`, {
        location_id: location.id,
        items: items.map(i => ({
          presentationId: i.presentationId,
          productId:      i.productId,
          product_name:   i.product_name,
          label:          i.label,
          price:          i.price,
          qty:            i.qty,
          subtotal:       i.subtotal,
        })),
      })
      toastSuccess('Factura actualizada')
      onSaved(updated)
    } catch (err) {
      toastError(err.message || 'Error al editar la factura')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-start justify-center p-3 sm:p-6 overflow-y-auto" onClick={onClose}>
      <div
        className="card bg-surface-200 w-full max-w-lg my-4 space-y-4 animate-scale-in"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-syne font-bold text-lg text-white">
              Editar factura <span className="text-brand-400">#{invoice?.code}</span>
            </h2>
            <p className="text-xs text-gray-500">Vendedor: {invoice?.seller_name}</p>
          </div>
          <button
            onClick={onClose}
            className="btn-touch-safe inline-flex items-center justify-center rounded-lg text-gray-400 hover:text-white hover:bg-surface-50 transition-colors"
            aria-label="Cerrar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Lista de items editables */}
        <div className="space-y-1.5 max-h-[40vh] overflow-y-auto">
          {items.length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-4">Sin items. Agrega productos del catálogo.</p>
          ) : items.map((item, idx) => (
            <div key={idx} className="bg-surface-400 rounded-lg px-3 py-2 flex items-center gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-white truncate">{item.product_name}</p>
                <p className="text-[10px] text-gray-500">{item.label} · {formatCOP(item.price)} c/u</p>
              </div>

              {/* Controles cantidad */}
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => updateQty(idx, item.qty - 1)}
                  className="w-7 h-7 rounded-md bg-surface-50 hover:bg-surface-100 text-gray-400 hover:text-white text-sm flex items-center justify-center transition-colors"
                >
                  −
                </button>
                <span className="w-7 text-center text-sm font-mono font-semibold text-white">{item.qty}</span>
                <button
                  onClick={() => updateQty(idx, item.qty + 1)}
                  className="w-7 h-7 rounded-md bg-surface-50 hover:bg-brand-500/30 text-gray-400 hover:text-brand-400 text-sm flex items-center justify-center transition-colors"
                >
                  +
                </button>
              </div>

              <span className="text-xs font-mono font-semibold text-brand-400 w-20 text-right shrink-0">
                {formatCOP(item.subtotal)}
              </span>

              <button
                onClick={() => removeItem(idx)}
                className="text-gray-500 hover:text-red-400 transition-colors p-1.5 -m-1 ml-0.5"
                aria-label={`Quitar ${item.product_name}`}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>

        {/* Botón agregar producto */}
        {!showCatalog ? (
          <button
            onClick={() => setShowCatalog(true)}
            className="btn btn-ghost w-full border border-dashed border-white/10 text-gray-400 hover:text-brand-400 hover:border-brand-500/30"
          >
            + Agregar producto
          </button>
        ) : (
          <div className="bg-surface-400 rounded-xl p-3 space-y-2 border border-white/5">
            <div className="flex items-center gap-2">
              <input
                type="search"
                placeholder="Buscar producto..."
                value={query}
                onChange={e => setQuery(e.target.value)}
                className="input flex-1 text-sm"
                autoFocus
              />
              <button
                onClick={() => { setShowCatalog(false); setQuery('') }}
                className="text-gray-500 hover:text-white p-2 -m-1 shrink-0"
                aria-label="Cerrar búsqueda"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="max-h-48 overflow-y-auto space-y-1">
              {filteredProducts.map(product => (
                <div key={product.id} className="space-y-0.5">
                  <p className="text-[10px] text-gray-500 font-medium px-1">{product.name}</p>
                  {(product.presentations || []).filter(p => p.active !== false).map(pres => (
                    <button
                      key={pres.id}
                      onClick={() => addFromCatalog(product, pres)}
                      className="w-full flex items-center justify-between px-2 py-1.5 rounded-md text-xs bg-surface-300 hover:bg-surface-200 text-gray-300 hover:text-white transition-colors"
                    >
                      <span>{pres.label}</span>
                      <span className="font-mono text-brand-400">{formatCOP(pres.price)}</span>
                    </button>
                  ))}
                </div>
              ))}
              {filteredProducts.length === 0 && (
                <p className="text-gray-400 text-xs text-center py-3">Sin resultados</p>
              )}
            </div>
          </div>
        )}

        {/* Total */}
        <div className="flex items-center justify-between border-t border-white/5 pt-3">
          <span className="text-gray-400 text-sm font-medium">Nuevo total</span>
          <span className="font-syne font-bold text-xl text-white">{formatCOP(total)}</span>
        </div>

        {/* Acciones */}
        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="btn btn-ghost">Cancelar</button>
          <button
            onClick={handleSave}
            disabled={saving || items.length === 0}
            className="btn btn-primary"
          >
            {saving ? 'Guardando...' : 'Guardar cambios'}
          </button>
        </div>
      </div>
    </div>
  )
}
