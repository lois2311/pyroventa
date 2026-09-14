import { useState, useId } from 'react'
import { ShoppingCart, Ticket, X, Pencil, RotateCcw, MapPin } from 'lucide-react'
import { useCartStore }    from '../store/cartStore.js'
import { useAuthStore }    from '../store/authStore.js'
import { formatCOP }       from '../lib/format.js'
import { useModalA11y }    from '../hooks/useModalA11y.js'

export default function CartPanel({ onCheckout, loading }) {
  const { items, updateQty, updatePrice, resetPrice, removeItem, total, clear } = useCartStore()
  const cartTotal = total()
  const [editingItem, setEditingItem] = useState(null)
  const isOwner = useAuthStore(s => s.seller?.role === 'owner')

  if (!items.length) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center p-6 text-gray-400">
        <ShoppingCart className="w-10 h-10 mb-3" />
        <p className="text-sm font-medium">Carrito vacío</p>
        <p className="text-xs mt-1">Selecciona productos del catálogo</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full relative">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
        <span className="font-semibold text-sm text-white">
          Carrito <span className="text-gray-400 font-normal">({items.length} ítem{items.length !== 1 ? 's' : ''})</span>
        </span>
        <button
          onClick={clear}
          className="text-xs text-gray-400 hover:text-red-400 transition-colors"
        >
          Limpiar
        </button>
      </div>

      {/* Lista de items */}
      <div className="flex-1 overflow-y-auto px-3 py-2 flex flex-col gap-1.5">
        {items.map(item => (
          <CartItem
            key={item.presentationId}
            item={item}
            canEditPrice={isOwner}
            onUpdateQty={(qty) => updateQty(item.presentationId, qty)}
            onEditPrice={() => setEditingItem(item)}
            onRemove={() => removeItem(item.presentationId)}
          />
        ))}
      </div>

      {/* Total + botón */}
      <div className="p-3 border-t border-white/5 bg-surface-500 flex flex-col gap-2">
        <div className="flex justify-between items-center text-sm">
          <span className="text-gray-400">Total</span>
          <span className="font-bold text-base font-mono text-white">
            {formatCOP(cartTotal)}
          </span>
        </div>
        <button
          onClick={onCheckout}
          disabled={loading || !items.length}
          className="w-full py-2.5 rounded-lg font-medium text-sm transition-all flex items-center justify-center gap-2 bg-brand-500 hover:bg-brand-400 text-white disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-brand-500/20 active:scale-[0.98]"
        >
          {loading ? (
            <span className="flex items-center gap-2">
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
              </svg>
              Generando...
            </span>
          ) : (
            <span className="inline-flex items-center gap-2">
              <Ticket className="w-4 h-4" /> Generar Factura
            </span>
          )}
        </button>
      </div>

      {/* Modal para editar precio unitario del item (solo superadministrador) */}
      {editingItem && isOwner && (
        <EditPriceModal
          item={editingItem}
          onClose={() => setEditingItem(null)}
          onSave={(newPrice, reason) => {
            updatePrice(editingItem.presentationId, newPrice, reason)
            setEditingItem(null)
          }}
          onReset={() => {
            resetPrice(editingItem.presentationId)
            setEditingItem(null)
          }}
        />
      )}
    </div>
  )
}

// ---- Item individual ------------------------------------
function CartItem({ item, onUpdateQty, onEditPrice, canEditPrice, onRemove }) {
  return (
    <div className="bg-surface-400 rounded-lg px-3 py-2 flex items-center gap-2">
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-white truncate">{item.productName}</p>
        <div className="flex items-center gap-1.5 flex-wrap">
          <p className="text-[11px] text-gray-400">
            {item.label} · {formatCOP(item.price)}
          </p>
          {item.is_price_edited && (
            <span className="text-[9px] bg-amber-500/20 text-amber-300 font-medium px-1.5 py-0.2 rounded border border-amber-500/30">
              Editado (Base: {formatCOP(item.original_price)})
            </span>
          )}
          {item.is_location_price && !item.is_price_edited && (
            <span
              className="text-[9px] bg-brand-500/20 text-brand-300 font-medium px-1.5 py-0.2 rounded border border-brand-500/30 inline-flex items-center gap-0.5"
              title={`Precio de este punto (empresa: ${formatCOP(item.company_price)})`}
            >
              <MapPin className="w-2.5 h-2.5" /> Precio de este punto
            </span>
          )}
        </div>
        {item.is_price_edited && item.price_edit_reason && (
          <p className="text-[10px] text-gray-400 italic truncate mt-0.5">
            Motivo: {item.price_edit_reason}
          </p>
        )}
      </div>

      {/* Botón editar precio (solo superadministrador) */}
      {canEditPrice && (
        <button
          onClick={onEditPrice}
          title="Editar precio unitario (Superadmin)"
          aria-label={`Editar precio de ${item.productName}`}
          className="w-7 h-7 rounded-md text-gray-400 hover:text-brand-400 hover:bg-surface-100 flex items-center justify-center transition-colors"
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>
      )}

      {/* Controles cantidad */}
      <div className="flex items-center gap-1 shrink-0">
        <button
          onClick={() => onUpdateQty(item.qty - 1)}
          className="w-6 h-6 rounded-md bg-surface-50 hover:bg-surface-100 text-gray-400 hover:text-white text-sm flex items-center justify-center transition-colors"
        >
          −
        </button>
        <span className="w-6 text-center text-sm font-mono font-semibold text-white">{item.qty}</span>
        <button
          onClick={() => onUpdateQty(item.qty + 1)}
          className="w-6 h-6 rounded-md bg-surface-50 hover:bg-brand-500/30 text-gray-400 hover:text-brand-400 text-sm flex items-center justify-center transition-colors"
        >
          +
        </button>
      </div>

      {/* Subtotal */}
      <span className="text-xs font-mono font-semibold text-brand-400 w-16 text-right shrink-0">
        {formatCOP(item.subtotal)}
      </span>

      {/* Eliminar */}
      <button
        onClick={onRemove}
        className="text-gray-400 hover:text-red-400 transition-colors p-1.5 -m-1 ml-0.5"
        aria-label={`Quitar ${item.productName}`}
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}

// ---- Modal de Edición de Precio ----
const COMMON_REASONS = [
  'Descuento por volumen',
  'Cliente frecuente / Mayorista',
  'Empaque o producto con detalle',
  'Negociación autorizada',
  'Cortesía / Promoción',
]

function EditPriceModal({ item, onClose, onSave, onReset }) {
  const titleId = useId()
  const panelRef = useModalA11y(onClose)
  const basePrice = item.original_price ?? item.base_price ?? item.price

  const [priceStr, setPriceStr] = useState(String(item.price))
  const [reason,   setReason]   = useState(item.price_edit_reason || '')
  const [error,    setError]    = useState('')

  const handleSave = (e) => {
    e?.preventDefault()
    const num = Number(priceStr)
    if (!Number.isFinite(num) || num < 0) {
      setError('Ingresa un precio válido (mayor o igual a 0)')
      return
    }
    onSave(num, reason)
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in" onClick={onClose}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="card bg-surface-200 border border-white/10 w-full max-w-sm space-y-4 shadow-2xl animate-scale-in"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/5 pb-2">
          <div>
            <h3 id={titleId} className="font-syne font-bold text-white text-base">Modificar precio unitario</h3>
            <p className="text-xs text-gray-400 truncate max-w-[240px]">{item.productName} ({item.label})</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white p-1" aria-label="Cerrar">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs bg-surface-300 p-2.5 rounded-lg border border-white/5">
            <span className="text-gray-400">Precio base de catálogo:</span>
            <span className="font-mono font-semibold text-white">{formatCOP(basePrice)}</span>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-300 mb-1">Nuevo precio unitario ($)</label>
            <input
              type="number"
              min="0"
              step="100"
              value={priceStr}
              onChange={e => { setPriceStr(e.target.value); setError('') }}
              placeholder="0"
              autoFocus
              className="input font-mono text-lg font-bold text-brand-400 w-full"
            />
            {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-300 mb-1">Motivo / Justificación</label>
            <input
              type="text"
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="Ej: Descuento autorizado por volumen..."
              className="input text-xs w-full mb-1.5"
            />
            <div className="flex flex-wrap gap-1">
              {COMMON_REASONS.map(r => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setReason(r)}
                  className="text-[10px] bg-surface-400 hover:bg-surface-300 text-gray-300 hover:text-white px-2 py-0.5 rounded transition-colors"
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-white/5 gap-2">
          {item.is_price_edited ? (
            <button
              type="button"
              onClick={onReset}
              className="btn btn-ghost text-xs text-amber-400 hover:text-amber-300 inline-flex items-center gap-1"
            >
              <RotateCcw className="w-3 h-3" /> Restablecer
            </button>
          ) : <div />}

          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="btn btn-ghost text-xs">
              Cancelar
            </button>
            <button type="button" onClick={handleSave} className="btn btn-primary text-xs">
              Guardar precio
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
