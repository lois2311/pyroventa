import { useCartStore }    from '../store/cartStore.js'
import { formatCOP }       from '../lib/format.js'

export default function CartPanel({ onCheckout, loading }) {
  const { items, updateQty, removeItem, total, clear } = useCartStore()
  const cartTotal = total()

  if (!items.length) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center p-6 text-gray-600">
        <span className="text-4xl mb-3">🛒</span>
        <p className="text-sm font-medium">Carrito vacío</p>
        <p className="text-xs mt-1">Selecciona productos del catálogo</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
        <span className="font-semibold text-sm text-white">
          Carrito <span className="text-gray-500 font-normal">({items.length} ítem{items.length !== 1 ? 's' : ''})</span>
        </span>
        <button
          onClick={clear}
          className="text-xs text-gray-600 hover:text-red-400 transition-colors"
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
            onUpdateQty={(qty) => updateQty(item.presentationId, qty)}
            onRemove={() => removeItem(item.presentationId)}
          />
        ))}
      </div>

      {/* Total + botón */}
      <div className="border-t border-white/5 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-gray-400 text-sm">Total</span>
          <span className="font-syne font-bold text-xl text-white">{formatCOP(cartTotal)}</span>
        </div>
        <button
          onClick={onCheckout}
          disabled={loading || !items.length}
          className="btn btn-primary btn-lg w-full"
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
            <>🎫 Generar Factura</>
          )}
        </button>
      </div>
    </div>
  )
}

// ---- Item individual ------------------------------------
function CartItem({ item, onUpdateQty, onRemove }) {
  return (
    <div className="bg-surface-400 rounded-lg px-3 py-2 flex items-center gap-2">
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-white truncate">{item.productName}</p>
        <p className="text-xs text-gray-500">{item.label}</p>
      </div>

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
        className="text-gray-700 hover:text-red-400 transition-colors text-sm ml-1"
      >
        ✕
      </button>
    </div>
  )
}
