import { useState, useEffect } from 'react'
import { useCartStore } from '../store/cartStore.js'
import { formatCOP }    from '../lib/format.js'

export default function ProductCard({ product }) {
  const addItem = useCartStore(s => s.addItem)
  const items   = useCartStore(s => s.items)
  const [imgFailed, setImgFailed] = useState(false)
  const [zoomed,    setZoomed]    = useState(false)

  // Reintentar si la URL cambia (foto corregida) tras un fallo de carga
  useEffect(() => { setImgFailed(false) }, [product.image_url])

  // Cerrar el zoom con Escape
  useEffect(() => {
    if (!zoomed) return
    const onKey = (e) => { if (e.key === 'Escape') setZoomed(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [zoomed])

  const presentations = (product.presentations || []).filter(p => p.active !== false)
  if (!presentations.length) return null

  const showImage = product.image_url && !imgFailed

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
      {/* Foto — tocar para ampliar (referencia visual para el cliente) */}
      {showImage && (
        <button
          type="button"
          onClick={() => setZoomed(true)}
          aria-label={`Ampliar foto de ${product.name}`}
          className="block w-full mb-3 cursor-zoom-in rounded-lg overflow-hidden border border-white/5"
        >
          <img
            src={product.image_url}
            alt={product.name}
            loading="lazy"
            crossOrigin="anonymous"
            onError={() => setImgFailed(true)}
            className="w-full h-24 object-cover"
          />
        </button>
      )}

      {/* Overlay de zoom */}
      {zoomed && showImage && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex flex-col items-center justify-center p-4 cursor-zoom-out"
          onClick={() => setZoomed(false)}
          role="dialog"
          aria-label={`Foto de ${product.name}`}
        >
          <button
            type="button"
            onClick={() => setZoomed(false)}
            aria-label="Cerrar foto"
            className="absolute top-4 right-4 w-9 h-9 rounded-full bg-surface-300 text-gray-300 hover:text-white flex items-center justify-center text-lg"
          >
            ✕
          </button>
          <img
            src={product.image_url}
            alt={product.name}
            crossOrigin="anonymous"
            className="max-w-full max-h-[80dvh] object-contain rounded-xl"
          />
          <p className="text-white text-sm font-medium mt-3 text-center">{product.name}</p>
        </div>
      )}

      {/* Cabecera */}
      <div className="flex items-start gap-2 mb-3">
        {!showImage && <span className="text-xl shrink-0">{product.categories?.icon || '🎆'}</span>}
        <div className="min-w-0">
          <h3 className="font-medium text-white text-sm leading-tight">{product.name}</h3>
          {product.categories?.name && (
            <span className="text-xs text-gray-400">{product.categories.name}</span>
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
