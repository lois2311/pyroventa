import { Sparkles, MapPin, Package } from 'lucide-react'
import { useCartStore, productQtyInCart } from '../store/cartStore.js'
import { useAuthStore } from '../store/authStore.js'
import { formatCOP }    from '../lib/format.js'
import { useToast }     from './Toast.jsx'
import ProductImage     from './ProductImage.jsx'
import { buildCartItem, activePresentations, stockWarning } from '../lib/cartItem.js'

/** `onAdded(event)`: después de agregar (VendedorPage devuelve el foco al escáner). */
export default function ProductCard({ product, onAdded }) {
  const addItem = useCartStore(s => s.addItem)
  const items   = useCartStore(s => s.items)
  const tenant  = useAuthStore(s => s.tenant)
  const { warn } = useToast()
  const hasInventory = Boolean(tenant?.has_inventory)
  const stockQty = Number(product.stock_quantity ?? 0)

  // Con inventario activo no se vende lo que no hay: agotado = botones
  // deshabilitados; con todo el stock ya en el carrito, tocar avisa por qué
  // no suma. (El tope es por producto: todas las presentaciones cuentan.)
  const inCart     = productQtyInCart(items, product.id)
  const outOfStock = hasInventory && stockQty <= 0
  const atCap      = hasInventory && !outOfStock && inCart >= stockQty

  const presentations = activePresentations(product)
  if (!presentations.length) return null

  const handleAdd = (pres, e) => {
    const added = addItem(buildCartItem(product, pres, hasInventory))
    if (!added) warn(stockWarning(product))
    onAdded?.(e)
  }

  // Cantidad real en el carrito, no solo si está o no — un cajero agregando
  // varias unidades necesita ver cuántas lleva sin abrir el carrito.
  const qtyInCart = (presId) => items.find(i => i.presentationId === presId)?.qty || 0

  return (
    <div className="card flex flex-col bg-surface-300 transition-colors duration-150 hover:border-white/10">
      {/* Foto — completa, sin recortar; tocar para ampliar */}
      {product.image_url && (
        <div className="mb-3">
          <ProductImage
            src={product.image_url}
            name={product.name}
            fit="contain"
            className="w-full h-36 block bg-surface-400"
          />
        </div>
      )}

      {/* Cabecera */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex items-start gap-2 min-w-0">
          {!product.image_url && <Sparkles className="w-5 h-5 text-gray-400 shrink-0 mt-0.5" />}
          <div className="min-w-0">
            <h3 className="font-medium text-white text-sm leading-tight">{product.name}</h3>
            {product.categories?.name && (
              <span className="mt-0.5 block text-xs leading-4 text-gray-400">{product.categories.name}</span>
            )}
          </div>
        </div>

        {hasInventory && (
          <span
            className={`text-2xs px-2 py-0.5 rounded-lg font-mono font-medium shrink-0 flex items-center gap-1 ${
              stockQty <= 0
                ? 'bg-red-400/15 text-red-400 border border-red-400/20'
                : stockQty <= 5
                ? 'bg-yellow-400/15 text-yellow-400 border border-yellow-400/20'
                : 'bg-surface-50 text-gray-400'
            }`}
          >
            <Package className="w-2.5 h-2.5" />
            {stockQty <= 0 ? 'Sin existencia' : `Quedan ${stockQty}`}
          </span>
        )}
      </div>

      {/* Presentaciones */}
      <div className="flex flex-col gap-1.5">
        {presentations.map(pres => {
          const qty = qtyInCart(pres.id)
          const active = qty > 0
          return (
            <button
              key={pres.id}
              type="button"
              onClick={(e) => handleAdd(pres, e)}
              data-pres-button
              disabled={outOfStock}
              aria-disabled={atCap || undefined}
              className={`
                press w-full min-h-[var(--control-h)] flex items-center justify-between px-3 py-1.5 rounded-lg text-sm border
                ${outOfStock
                  ? 'cursor-not-allowed border-white/5 bg-surface-400/60 text-gray-400 opacity-60'
                  : active
                  ? 'cursor-pointer bg-brand-500/15 border-brand-500/60 text-brand-300'
                  : 'cursor-pointer bg-surface-400 border-white/5 text-gray-300 hover:bg-surface-200 hover:border-white/10 hover:text-white'
                }
                ${atCap ? 'opacity-70' : ''}
              `}
            >
              <span className="truncate mr-2 inline-flex items-center gap-1">
                {pres.label}
                {pres.is_differential && (
                  <MapPin
                    className="w-3 h-3 text-brand-400 shrink-0"
                    aria-label="Precio especial de este punto de venta"
                  />
                )}
              </span>
              <div className="flex items-center gap-2 shrink-0">
                {pres.is_differential && (
                  <span className="text-2xs text-gray-400 line-through font-mono tabular-nums">
                    {formatCOP(pres.base_price)}
                  </span>
                )}
                <span className={`font-semibold font-mono tabular-nums text-xs text-right ${pres.is_differential ? 'text-brand-300' : ''}`}>
                  {formatCOP(pres.price)}
                </span>
                <span className={`
                  min-w-6 h-6 px-1 rounded flex items-center justify-center text-xs font-bold font-mono
                  ${active ? 'bg-brand-500 text-surface-700' : 'bg-surface-50 text-gray-400'}
                `}>
                  {active ? `×${qty}` : outOfStock ? '–' : '+'}
                </span>
              </div>
            </button>
          )
        })}
      </div>

      {atCap && (
        <p className="mt-2 text-2xs text-amber-300">
          Las {stockQty} que quedan ya están en el ticket.
        </p>
      )}
    </div>
  )
}
