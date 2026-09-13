import { useEffect, useRef, useState } from 'react'

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/**
 * Anima un número desde su valor previo hasta `value` en `duration` ms.
 * Devuelve el número crudo en cada frame — el llamador decide el formato
 * (formatCOP, entero plano, etc). Sin animación si el sistema pide
 * movimiento reducido, o si `value` no es un número finito.
 */
export function useCountUp(value, duration = 600) {
  const [display, setDisplay] = useState(value)
  const fromRef = useRef(value)

  useEffect(() => {
    if (typeof value !== 'number' || !isFinite(value) || prefersReducedMotion()) {
      setDisplay(value)
      fromRef.current = value
      return
    }

    const from = fromRef.current
    const to = value
    if (from === to) return

    let raf
    const start = performance.now()

    const tick = (now) => {
      const t = Math.min((now - start) / duration, 1)
      const eased = 1 - Math.pow(1 - t, 3) // ease-out cubic
      setDisplay(from + (to - from) * eased)
      if (t < 1) raf = requestAnimationFrame(tick)
      else fromRef.current = to
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value, duration])

  return display
}
