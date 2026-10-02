import { useState, useEffect } from 'react'

/**
 * Miniatura de producto para listas de administración (sin zoom).
 * Si no hay foto o la carga falla muestra el respaldo (`fallback`), nunca el
 * ícono de imagen rota del navegador. `className` define tamaño y forma.
 */
export default function ProductThumb({ src, alt = '', fallback, className = 'h-8 w-8 rounded-lg' }) {
  const [failed, setFailed] = useState(false)
  useEffect(() => { setFailed(false) }, [src])

  if (!src || failed) return fallback ?? null
  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      onError={() => setFailed(true)}
      className={`${className} shrink-0 border border-white/10 object-cover`}
    />
  )
}
