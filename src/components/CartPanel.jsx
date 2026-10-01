import { useState, useId, useEffect, useRef } from 'react'
import { AlertTriangle, ShoppingCart, Ticket, X, Pencil, RotateCcw, MapPin, Pause } from 'lucide-react'
import { useCartStore, productQtyInCart, overStockItems } from '../store/cartStore.js'
import { useAuthStore }    from '../store/authStore.js'
import { formatCOP }       from '../lib/format.js'
import { useConfirm }      from './ConfirmDialog.jsx'
import Modal               from './Modal.jsx'
import Kbd                 from './Kbd.jsx'
import { isTypingTarget }  from '../lib/device.js'

/**
 * Ticket de la venta en curso.
 * `shortcuts`: esta instancia escucha el teclado. Solo una a la vez: la del
 * panel de escritorio.
 *   F12        genera la factura
 *   Esc        cancela la venta (con confirmación)
 *   + / −      suma o resta una unidad a la línea activa
 *   Supr       quita la línea activa
 *   ↑ / ↓      cambia la línea activa
 * Las teclas de línea actúan fuera de los campos, o desde el escáner vacío
 * (con texto en el escáner, + y − se escriben y ↓ baja al catálogo).
 * `onPark`: pone la venta en pausa (F8, lo escucha VendedorPage).
 * `onFocusScanner`: devuelve el foco al escáner al cerrar el editor de precio.
 */
export default function CartPanel({ onCheckout, loading, shortcuts = false, onFocusScanner, onPark }) {
  const { items, updateQty, updatePrice, resetPrice, removeItem, total, clear } = useCartStore()
  const cartTotal = total()
  const [editingItem, setEditingItem] = useState(null)
  const [activeId, setActiveId] = useActiveItem(items)
  const isOwner = useAuthStore(s => s.seller?.role === 'owner')
  const confirm = useConfirm()
  // El stock pudo bajar después de agregar (otro vendedor cobró y el
  // catálogo se refrescó): no se factura más de lo que hay.
  const overStock = overStockItems(items)

  // Desde el teclado (Esc) siempre se confirma: una tecla suelta no debe
  // borrar una venta sin aviso, aunque tenga un solo producto.
  const handleClear = async ({ alwaysConfirm = false } = {}) => {
    if (items.length > 1 || alwaysConfirm) {
      const ok = await confirm({
        title: '¿Cancelar la venta?',
        description: items.length > 1
          ? `Se quitan los ${items.length} productos del ticket.`
          : 'Se quita el producto del ticket.',
        confirmLabel: 'Cancelar venta',
        cancelLabel: 'Seguir vendiendo',
        tone: 'danger',
      })
      if (!ok) return
    }
    clear()
  }

  const canCheckout = !loading && items.length > 0 && overStock.length === 0

  // F12 genera la factura · Esc cancela la venta. No actúan mientras se
  // escribe en un campo ni con un diálogo abierto. Estado leído por ref.
  const keys = useRef(null)
  keys.current = { canCheckout, onCheckout, handleClear, items, activeId, setActiveId, updateQty, removeItem }
  useEffect(() => {
    if (!shortcuts) return
    const onKey = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented) return
      if (document.querySelector('[role="dialog"]')) return
      const k = keys.current
      const hasItems = k.items.length > 0
      if (e.key === 'F12') {
        e.preventDefault()
        if (!e.repeat && k.canCheckout) k.onCheckout()
        return
      }
      const typing = isTypingTarget(e.target)
      if (e.key === 'Escape' && hasItems) {
        if (typing) return
        e.preventDefault()
        k.handleClear({ alwaysConfirm: true })
        return
      }
      // Teclas de línea: fuera de los campos o desde el escáner vacío
      const emptyScanner = e.target instanceof Element && e.target.matches('[data-scanner-input]') && !e.target.value
      if (!hasItems || (typing && !emptyScanner)) return
      const idx = k.items.findIndex(i => i.presentationId === k.activeId)
      const active = k.items[idx]
      if (!active) return
      if (e.key === '+' || e.key === '-') {
        e.preventDefault()
        k.updateQty(active.presentationId, active.qty + (e.key === '+' ? 1 : -1))
      } else if (e.key === 'Delete') {
        e.preventDefault()
        k.removeItem(active.presentationId)
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault()
        const next = k.items[Math.min(k.items.length - 1, Math.max(0, idx + (e.key === 'ArrowUp' ? -1 : 1)))]
        k.setActiveId(next.presentationId)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [shortcuts])

  if (!items.length) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center p-6 text-gray-400">
        <span className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-surface-300">
          <ShoppingCart className="h-6 w-6" />
        </span>
        <p className="text-sm font-medium text-gray-200">Listo para vender.</p>
        <p className="mt-1 text-xs">
          Escanea o toca un producto para empezar.
          {shortcuts && <> <Kbd className="ml-1">/</Kbd></>}
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full relative">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 border-b border-white/5 px-4 py-2.5">
        <h2 className="text-sm font-semibold text-white">
          Ticket <span className="font-mono font-normal text-gray-400">({items.length})</span>
        </h2>
        <div className="-mr-2 flex items-center gap-1">
          {onPark && (
            <button
              type="button"
              onClick={onPark}
              aria-keyshortcuts="F8"
              aria-label="Pausar venta"
              title="Pausar venta: atiende a otro cliente y retómala después"
              className="btn-ghost btn-sm min-w-[var(--control-h-sm)] px-2 text-gray-400 hover:text-amber-300"
            >
              <Pause className="h-4 w-4" aria-hidden="true" />
              <span className="hidden 2xl:inline">Pausar</span>
              {shortcuts && <Kbd>F8</Kbd>}
            </button>
          )}
          <button
            type="button"
            onClick={() => handleClear()}
            aria-keyshortcuts="Escape"
            className="btn-ghost btn-sm text-gray-400 hover:text-red-400"
          >
            Cancelar venta {shortcuts && <Kbd>Esc</Kbd>}
          </button>
        </div>
      </div>

      {/* Lista de items */}
      <div className="flex-1 overflow-y-auto px-3 py-3 flex flex-col gap-2">
        {items.map(item => (
          <CartItem
            key={item.presentationId}
            item={item}
            productQty={productQtyInCart(items, item.productId)}
            active={item.presentationId === activeId}
            showKeys={shortcuts}
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
          <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-400/25 bg-red-400/10 px-3 py-2 text-xs text-red-300">
            <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <p>
              Sin existencia suficiente. {overStock.map(p => `Quedan ${p.stock} de ${p.productName}`).join('. ')}.
            </p>
          </div>
        )}
        <div className="cq">
          <span className="eyebrow">Total</span>
          <p className="total-display mt-1 text-right" aria-live="polite">
            {formatCOP(cartTotal)}
          </p>
        </div>
        <button
          type="button"
          onClick={onCheckout}
          disabled={!canCheckout}
          aria-keyshortcuts="F12"
          className="btn-primary btn-lg w-full"
        >
          {loading ? (
            <span className="flex items-center gap-2">
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
              </svg>
              Generando…
            </span>
          ) : (
            <span className="inline-flex items-center gap-2">
              <Ticket className="w-4 h-4" /> Generar factura
              <Kbd className="kbd-on-fill">F12</Kbd>
            </span>
          )}
        </button>
      </div>

      {/* Modal para editar precio unitario del item (solo superadministrador) */}
      {editingItem && isOwner && (
        <EditPriceModal
          item={editingItem}
          onClose={() => { setEditingItem(null); onFocusScanner?.() }}
          onSave={(newPrice, reason) => {
            updatePrice(editingItem.presentationId, newPrice, reason)
            setEditingItem(null)
            onFocusScanner?.()
          }}
          onReset={() => {
            resetPrice(editingItem.presentationId)
            setEditingItem(null)
            onFocusScanner?.()
          }}
        />
      )}
    </div>
  )
}

// ---- Item individual ------------------------------------
// Dos filas: nombre + subtotal arriba (el nombre ya no se corta a 12
// caracteres), detalle + controles abajo. Los botones de cantidad son
// cuadrados de --control-h-sm (40px con mouse, 48px en pantallas táctiles).
// La fila activa (la última agregada o modificada) lleva la línea Voltaje y,
// con teclado, las teclas que la controlan (+ − Supr).
function CartItem({ item, productQty, active, showKeys, onUpdateQty, onEditPrice, canEditPrice, onRemove }) {
  const hasStock = item.stock !== null && item.stock !== undefined
  const atCap = hasStock && productQty >= item.stock
  return (
    <div
      aria-current={active ? 'true' : undefined}
      className={`rounded-lg border px-3 py-2.5 transition-colors ${active ? 'row-active border-white/10 bg-surface-300' : 'border-white/5 bg-surface-400'}`}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 text-sm font-medium leading-snug text-white">{item.productName}</p>
        <span className={`shrink-0 text-right font-mono text-sm font-semibold tabular-nums ${active ? 'text-brand-400' : 'text-white'}`}>
          {formatCOP(item.subtotal)}
        </span>
      </div>

      <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
        <p className="text-xs text-gray-400">
          {item.label} · <span className="font-mono tabular-nums">{formatCOP(item.price)}</span>
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
            aria-keyshortcuts={active && showKeys ? '-' : undefined}
            className="press flex h-[var(--control-h-sm)] w-[var(--control-h-sm)] items-center justify-center rounded-l-lg text-lg text-gray-300 transition-colors hover:bg-surface-50 hover:text-white"
          >
            −
          </button>
          <span className="min-w-8 px-1 text-center font-mono text-sm font-semibold tabular-nums text-white" aria-live="polite">{item.qty}</span>
          <button
            type="button"
            onClick={() => onUpdateQty(item.qty + 1)}
            disabled={atCap}
            aria-label={`Agregar una unidad de ${item.productName}`}
            aria-keyshortcuts={active && showKeys ? '+' : undefined}
            className="press flex h-[var(--control-h-sm)] w-[var(--control-h-sm)] items-center justify-center rounded-r-lg text-lg text-gray-300 transition-colors hover:bg-brand-500/20 hover:text-brand-300 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-gray-300"
          >
            +
          </button>
        </div>

        {active && showKeys && <Kbd className="ml-1.5">±</Kbd>}

        {atCap && (
          <span className={`ml-2 text-2xs ${productQty > item.stock ? 'text-red-400' : 'text-amber-300'}`}>
            {item.stock <= 0 ? 'Sin existencia' : `Quedan ${item.stock}`}
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

        {/* Eliminar: separado del lápiz para no tocarlo por error */}
        <button
          type="button"
          onClick={onRemove}
          aria-keyshortcuts={active && showKeys ? 'Delete' : undefined}
          className={`btn-ghost btn-sm ml-3 min-w-[var(--control-h-sm)] shrink-0 text-gray-400 hover:text-red-400 ${active && showKeys ? 'px-2' : 'btn-icon'}`}
          aria-label={`Quitar ${item.productName}`}
        >
          <X className="h-4 w-4" />
          {active && showKeys && <Kbd>Supr</Kbd>}
        </button>
      </div>
    </div>
  )
}

// ---- Fila activa ------------------------------------------
// La última presentación agregada o cuya cantidad cambió; si se quita, la
// última del ticket. Solo presentación: no toca el carrito.
function useActiveItem(items) {
  // Patrón "guardar el valor anterior en estado" (sin efecto ni ref en render)
  const [prevItems, setPrevItems] = useState(items)
  const [touched, setTouched] = useState(null)
  if (items !== prevItems) {
    const prevQty = new Map(prevItems.map(i => [i.presentationId, i.qty]))
    const changed = items.find(i => prevQty.get(i.presentationId) !== i.qty)
    setPrevItems(items)
    if (changed) setTouched(changed.presentationId)
  }
  const activeId = touched && items.some(i => i.presentationId === touched)
    ? touched
    : items[items.length - 1]?.presentationId ?? null
  return [activeId, setTouched]
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
          className="input font-mono text-lg font-bold"
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
