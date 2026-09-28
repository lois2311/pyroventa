import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Sparkles, X } from 'lucide-react'
import { useModalA11y } from '../hooks/useModalA11y.js'

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

  // Diálogo estándar: Escape cierra, foco atrapado y devuelto a la miniatura
  const zoomRef = useModalA11y(() => setZoomed(false))

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

      {/* Portal: dentro de un modal (Editar factura) un ancestro con
          transform encerraba el `fixed` en el panel en vez de la pantalla. */}
      {zoomed && createPortal(
        <div data-theme="dark" className="fixed inset-0 z-[70] flex items-center justify-center bg-black/90 p-4 animate-fade-in">
          {/* Tocar en cualquier parte cierra; con teclado, Escape o la X */}
          <button
            type="button"
            tabIndex={-1}
            aria-label="Cerrar foto"
            onClick={(e) => { e.stopPropagation(); setZoomed(false) }}
            className="absolute inset-0 h-full w-full cursor-zoom-out"
          />
          <div
            ref={zoomRef}
            role="dialog"
            aria-modal="true"
            aria-label={`Foto de ${name}`}
            tabIndex={-1}
            className="pointer-events-none relative flex max-h-full flex-col items-center"
          >
            <img
              src={src}
              alt={name}
              className="max-h-[80dvh] max-w-full rounded-xl object-contain"
            />
            <p className="mt-3 text-center text-sm font-medium text-white">{name}</p>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setZoomed(false) }}
              aria-label="Cerrar foto"
              className="pointer-events-auto absolute -right-2 -top-2 flex h-9 w-9 items-center justify-center rounded-full bg-surface-300 text-gray-300 shadow-lg hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}
