import { useState, useEffect } from 'react'
import { Sparkles, X } from 'lucide-react'

/**
 * Foto de producto con zoom: miniatura (o placeholder si no hay foto o
 * falla la carga) que al tocarla se amplía a pantalla completa.
 * `className` define el tamaño del slot (ej: "w-9 h-9" o "w-full h-36").
 * `fit`: 'cover' recorta para llenar (miniaturas pequeñas);
 *        'contain' muestra la foto completa sin recortar (tarjetas del catálogo).
 */
export default function ProductImage({ src, name, className = 'w-9 h-9', fit = 'cover' }) {
  const [zoomed, setZoomed] = useState(false)
  const [failed, setFailed] = useState(false)

  // Reintentar si la URL cambia (foto corregida) tras un fallo de carga
  useEffect(() => { setFailed(false) }, [src])

  // Cerrar el zoom con Escape
  useEffect(() => {
    if (!zoomed) return
    const onKey = (e) => { if (e.key === 'Escape') setZoomed(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [zoomed])

  if (!src || failed) {
    return (
      <span className={`${className} shrink-0 rounded-lg bg-surface-50 flex items-center justify-center text-gray-400`} aria-hidden="true">
        <Sparkles className="w-1/2 h-1/2" />
      </span>
    )
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setZoomed(true)}
        aria-label={`Ampliar foto de ${name}`}
        className={`${className} shrink-0 cursor-zoom-in rounded-lg overflow-hidden border border-white/5`}
      >
        {/* Sin crossOrigin a propósito: nadie lee estos píxeles (el único canvas
            del proyecto comprime archivos locales) y el service worker cachea
            las fotos con `statuses: [0, 200]`, es decir asumiendo respuestas
            opacas. Pedirlas en modo CORS hace que una respuesta opaca ya
            cacheada sea rechazada y la foto falle durante los 30 días del TTL. */}
        <img
          src={src}
          alt={name}
          loading="lazy"
          onError={() => setFailed(true)}
          className={`w-full h-full ${fit === 'contain' ? 'object-contain' : 'object-cover'}`}
        />
      </button>

      {zoomed && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex flex-col items-center justify-center p-4 cursor-zoom-out"
          onClick={(e) => { e.stopPropagation(); setZoomed(false) }}
          role="dialog"
          aria-label={`Foto de ${name}`}
        >
          <button
            type="button"
            onClick={() => setZoomed(false)}
            aria-label="Cerrar foto"
            className="absolute top-4 right-4 w-9 h-9 rounded-full bg-surface-300 text-gray-300 hover:text-white flex items-center justify-center"
          >
            <X className="w-4 h-4" />
          </button>
          <img
            src={src}
            alt={name}
            className="max-w-full max-h-[80dvh] object-contain rounded-xl"
          />
          <p className="text-white text-sm font-medium mt-3 text-center">{name}</p>
        </div>
      )}
    </>
  )
}
