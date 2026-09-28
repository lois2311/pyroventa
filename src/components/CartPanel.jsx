import { useState, useId } from 'react'
import { AlertTriangle, ShoppingCart, Ticket, X, Pencil, RotateCcw, MapPin } from 'lucide-react'
import { useCartStore, productQtyInCart, overStockItems } from '../store/cartStore.js'
import { useAuthStore }    from '../store/authStore.js'
import { formatCOP }       from '../lib/format.js'
import { useConfirm }      from './ConfirmDialog.jsx'
import Modal               from './Modal.jsx'

export default function CartPanel({ onCheckout, loading }) {
  const { items, updateQty, updatePrice, resetPrice, removeItem, total, clear } = useCartStore()
  const cartTotal = total()
  const [editingItem, setEditingItem] = useState(null)
  const isOwner = useAuthStore(s => s.seller?.role === 'owner')
  const confirm = useConfirm()
  // El stock pudo bajar después de agregar (otro vendedor cobró y el
  // catálogo se refrescó): no se factura más de lo que hay.
  const overStock = overStockItems(items)

  const handleClear = async () => {
    if (items.length > 1) {
      const ok = await confirm({
        title: '¿Vaciar el carrito?',
        description: `Se quitan los ${items.length} ítems de esta venta.`,
        confirmLabel: 'Vaciar',
        tone: 'danger',
      })
      if (!ok) return
    }
    clear()
  }

  if (!items.length) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center p-6 text-gray-400">
        <span className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-surface-300">
          <ShoppingCart className="h-6 w-6" />
        </span>
        <p className="text-sm font-medium text-gray-200">Carrito vacío</p>
        <p className="mt-1 text-xs">Toca una presentación del catálogo para agregarla</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full relative">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 border-b border-white/5 px-4 py-2.5">
        <h2 className="text-sm font-semibold text-white">
          Carrito <span className="font-normal text-gray-400">({items.length} ítem{items.length !== 1 ? 's' : ''})</span>
        </h2>
        <button
          type="button"
          onClick={handleClear}
          className="btn-ghost btn-sm -mr-2 text-gray-400 hover:text-red-400"
        >
          Limpiar
        </button>
      </div>

      {/* Lista de items */}
      <div className="flex-1 overflow-y-auto px-3 py-3 flex flex-col gap-2">
        {items.map(item => (
          <CartItem
            key={item.presentationId}
            item={item}
            productQty={productQtyInCart(items, item.productId)}
            canEditPrice={isOwner}
            onUpdateQty={(qty) => updateQty(item.presentationId, qty)}
            onEditPrice={() => setEditingItem(item)}
            onRemove={() => removeItem(item.presentationId)}
          />
        ))}
      </div>

      {/* Total + botón */}
      <div className="flex flex-col gap-3 border-t border-white/5 bg-surface-500 p-4">
        {overStock.length > 0 && (
          <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs text-red-300">
            <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <p>
              Ajusta las cantidades: {overStock.map(p => `${p.productName} (quedan ${p.stock})`).join(', ')}.
            </p>
          </div>
        )}
        <div className="flex items-baseline justify-between">
          <span className="text-sm text-gray-400">Total</span>
          <span className="font-mono text-2xl font-bold tabular-nums text-white">
            {formatCOP(cartTotal)}
          </span>
        </div>
        <button
          type="button"
          onClick={onCheckout}
          disabled={loading || !items.length || overStock.length > 0}
          className="btn-primary btn-lg w-full"
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
// Dos filas: nombre + subtotal arriba (el nombre ya no se corta a 12
// caracteres), detalle + controles abajo. Los botones de cantidad miden
// 32px (antes 24px), cómodos para el dedo en tablet.
function CartItem({ item, productQty, onUpdateQty, onEditPrice, canEditPrice, onRemove }) {
  const hasStock = item.stock !== null && item.stock !== undefined
  const atCap = hasStock && productQty >= item.stock
  return (
    <div className="rounded-lg border border-white/5 bg-surface-400 px-3 py-2.5">
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 text-sm font-medium leading-snug text-white">{item.productName}</p>
        <span className="shrink-0 font-mono text-sm font-semibold tabular-nums text-brand-400">
          {formatCOP(item.subtotal)}
        </span>
      </div>

      <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
        <p className="text-xs text-gray-400">
          {item.label} · {formatCOP(item.price)}
        </p>
        {item.is_price_edited && (
          <span className="rounded border border-amber-500/30 bg-amber-500/20 px-1.5 py-px text-2xs font-medium text-amber-300">
            Editado (Base: {formatCOP(item.original_price)})
          </span>
        )}
        {item.is_location_price && !item.is_price_edited && (
          <span
            className="inline-flex items-center gap-0.5 rounded border border-brand-500/30 bg-brand-500/20 px-1.5 py-px text-2xs font-medium text-brand-300"
            title={`Precio de este punto (empresa: ${formatCOP(item.company_price)})`}
          >
            <MapPin className="h-2.5 w-2.5" /> Precio de este punto
          </span>
        )}
      </div>
      {item.is_price_edited && item.price_edit_reason && (
        <p className="mt-0.5 truncate text-2xs italic text-gray-400">
          Motivo: {item.price_edit_reason}
        </p>
      )}

      <div className="mt-2 flex items-center gap-1">
        {/* Controles cantidad */}
        <div className="flex items-center rounded-lg border border-white/10 bg-surface-300">
          <button
            type="button"
            onClick={() => onUpdateQty(item.qty - 1)}
            aria-label={`Quitar una unidad de ${item.productName}`}
            className="flex h-8 w-8 items-center justify-center rounded-l-lg text-lg text-gray-300 transition-colors hover:bg-surface-50 hover:text-white"
          >
            −
          </button>
          <span className="w-8 text-center font-mono text-sm font-semibold tabular-nums text-white" aria-live="polite">{item.qty}</span>
          <button
            type="button"
            onClick={() => onUpdateQty(item.qty + 1)}
            disabled={atCap}
            aria-label={`Agregar una unidad de ${item.productName}`}
            className="flex h-8 w-8 items-center justify-center rounded-r-lg text-lg text-gray-300 transition-colors hover:bg-brand-500/20 hover:text-brand-300 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-gray-300"
          >
            +
          </button>
        </div>

        {atCap && (
          <span className={`ml-2 text-2xs ${productQty > item.stock ? 'text-red-400' : 'text-amber-300'}`}>
            {item.stock <= 0 ? 'Agotado' : `Solo quedan ${item.stock}`}
          </span>
        )}

        <div className="flex-1" />

        {/* Botón editar precio (solo superadministrador) */}
        {canEditPrice && (
          <button
            type="button"
            onClick={onEditPrice}
            title="Editar precio unitario (Superadmin)"
            aria-label={`Editar precio de ${item.productName}`}
            className="btn-ghost btn-icon btn-sm text-gray-400 hover:text-brand-400"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        )}

        {/* Eliminar */}
        <button
          type="button"
          onClick={onRemove}
          className="btn-ghost btn-icon btn-sm text-gray-400 hover:text-red-400"
          aria-label={`Quitar ${item.productName}`}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
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
  const fid = useId()
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
    <Modal
      title="Modificar precio unitario"
      description={`${item.productName} (${item.label})`}
      icon={Pencil}
      size="sm"
      onClose={onClose}
      onSubmit={handleSave}
      footer={<>
        {item.is_price_edited && (
          <button
            type="button"
            onClick={onReset}
            className="btn-ghost text-amber-400 hover:text-amber-300 sm:mr-auto"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Restablecer
          </button>
        )}
        <button type="button" onClick={onClose} className="btn-ghost">
          Cancelar
        </button>
        <button type="submit" className="btn-primary">
          Guardar precio
        </button>
      </>}
    >
      <div className="flex items-center justify-between rounded-lg border border-white/5 bg-surface-300 px-3 py-2.5 text-xs">
        <span className="text-gray-400">Precio base de catálogo</span>
        <span className="font-mono font-semibold text-white">{formatCOP(basePrice)}</span>
      </div>

      <div>
        <label htmlFor={`${fid}-price`} className="field-label">Nuevo precio unitario ($)</label>
        <input
          id={`${fid}-price`}
          type="number"
          min="0"
          step="100"
          inputMode="numeric"
          value={priceStr}
          onChange={e => { setPriceStr(e.target.value); setError('') }}
          placeholder="0"
          autoFocus
          className="input font-mono text-lg font-bold text-brand-400"
        />
        {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
      </div>

      <div>
        <label htmlFor={`${fid}-reason`} className="field-label">Motivo / justificación</label>
        <input
          id={`${fid}-reason`}
          type="text"
          value={reason}
          onChange={e => setReason(e.target.value)}
          placeholder="Ej: Descuento autorizado por volumen..."
          className="input"
        />
        <div className="mt-2 flex flex-wrap gap-1.5">
          {COMMON_REASONS.map(r => (
            <button
              key={r}
              type="button"
              onClick={() => setReason(r)}
              aria-pressed={reason === r}
              className="chip"
            >
              {r}
            </button>
          ))}
        </div>
      </div>
    </Modal>
  )
}
