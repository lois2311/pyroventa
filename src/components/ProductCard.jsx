import { Sparkles, MapPin, Package } from 'lucide-react'
import { useCartStore, productQtyInCart } from '../store/cartStore.js'
import { useAuthStore } from '../store/authStore.js'
import { formatCOP }    from '../lib/format.js'
import { useToast }     from './Toast.jsx'
import ProductImage     from './ProductImage.jsx'

export default function ProductCard({ product }) {
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

  const presentations = (product.presentations || []).filter(p => p.active !== false)
  if (!presentations.length) return null

  const handleAdd = (pres) => {
    const added = addItem({
      presentationId:   pres.id,
      productId:        product.id,
      productName:      product.name,
      label:            pres.label,
      price:            pres.price,
      isLocationPrice:  !!pres.is_differential,
      companyPrice:     pres.is_differential ? pres.base_price : undefined,
      stock:            hasInventory ? stockQty : null,
    })
    if (!added) {
      warn(stockQty <= 0
        ? `${product.name} está agotado`
        : `Solo hay ${stockQty} de ${product.name} y ya están en el carrito`)
    }
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
            className={`text-2xs px-2 py-0.5 rounded-full font-mono font-medium shrink-0 flex items-center gap-1 ${
              stockQty <= 0
                ? 'bg-red-500/15 text-red-400 border border-red-500/20'
                : stockQty <= 5
                ? 'bg-yellow-500/15 text-yellow-400 border border-yellow-500/20'
                : 'bg-surface-50 text-gray-400'
            }`}
          >
            <Package className="w-2.5 h-2.5" />
            {stockQty <= 0 ? 'Agotado' : `Stock: ${stockQty}`}
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
              onClick={() => handleAdd(pres)}
              disabled={outOfStock}
              aria-disabled={atCap || undefined}
              className={`
                w-full min-h-[var(--control-h)] flex items-center justify-between px-3 py-1.5 rounded-lg text-sm
                border transition-all duration-100
                ${outOfStock
                  ? 'cursor-not-allowed border-white/5 bg-surface-400/60 text-gray-500'
                  : active
                  ? 'cursor-pointer active:scale-[0.99] bg-brand-500/20 border-brand-500/60 text-brand-300'
                  : 'cursor-pointer active:scale-[0.99] bg-surface-400 border-white/5 text-gray-300 hover:bg-surface-200 hover:border-white/10 hover:text-white'
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
                  <span className="text-2xs text-gray-400 line-through font-mono">
                    {formatCOP(pres.base_price)}
                  </span>
                )}
                <span className={`font-semibold font-mono text-xs ${pres.is_differential ? 'text-brand-300' : ''}`}>
                  {formatCOP(pres.price)}
                </span>
                <span className={`
                  min-w-5 h-5 px-1 rounded-full flex items-center justify-center text-xs font-bold font-mono
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
          Todo el stock ({stockQty}) ya está en el carrito
        </p>
      )}
    </div>
  )
}
