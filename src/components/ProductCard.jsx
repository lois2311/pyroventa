import { useCartStore } from '../store/cartStore.js'
import { formatCOP }    from '../lib/format.js'

export default function ProductCard({ product }) {
  const addItem = useCartStore(s => s.addItem)
  const items   = useCartStore(s => s.items)

  const presentations = (product.presentations || []).filter(p => p.active !== false)
  if (!presentations.length) return null

  const handleAdd = (pres) => {
    addItem({
      presentationId: pres.id,
      productId:      product.id,
      productName:    product.name,
      label:          pres.label,
      price:          pres.price,
    })
  }

  const inCart = (presId) => items.some(i => i.presentationId === presId)

  return (
    <div className="card bg-surface-300 hover:border-white/10 transition-all duration-150">
      {/* Cabecera */}
      <div className="flex items-start gap-2 mb-3">
        <span className="text-xl shrink-0">{product.categories?.icon || '🎆'}</span>
        <div className="min-w-0">
          <h3 className="font-medium text-white text-sm leading-tight">{product.name}</h3>
          {product.categories?.name && (
            <span className="text-xs text-gray-600">{product.categories.name}</span>
          )}
        </div>
      </div>

      {/* Presentaciones */}
      <div className="flex flex-col gap-1.5">
        {presentations.map(pres => {
          const active = inCart(pres.id)
          return (
            <button
              key={pres.id}
              onClick={() => handleAdd(pres)}
              className={`
                w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm
                border transition-all duration-100 cursor-pointer
                ${active
                  ? 'bg-brand-500/20 border-brand-500/60 text-brand-300'
                  : 'bg-surface-400 border-white/5 text-gray-300 hover:bg-surface-200 hover:border-white/10 hover:text-white'
                }
              `}
            >
              <span className="truncate mr-2">{pres.label}</span>
              <div className="flex items-center gap-2 shrink-0">
                <span className="font-semibold font-mono text-xs">{formatCOP(pres.price)}</span>
                <span className={`
                  w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold
                  ${active ? 'bg-brand-500 text-white' : 'bg-surface-50 text-gray-500'}
                `}>
                  {active ? '✓' : '+'}
                </span>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
