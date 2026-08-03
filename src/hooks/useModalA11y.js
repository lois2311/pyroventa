import { useEffect, useRef } from 'react'

const FOCUSABLE = 'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Comportamiento estándar de diálogo modal: atrapa el foco dentro del panel,
 * cierra con Escape y devuelve el foco a quien lo abrió al cerrarse.
 *
 * Los modales del proyecto son un `<div fixed inset-0>` que cierra al hacer
 * click en el backdrop, sin nada de esto — un cajero navegando por teclado
 * quedaba encerrado detrás del modal, sin salida.
 *
 * Uso: pasar el ref devuelto al panel visible (la card interior, no el
 * backdrop) junto con `role="dialog" aria-modal="true" aria-labelledby`.
 */
export function useModalA11y(onClose) {
  const panelRef = useRef(null)

  useEffect(() => {
    const panel = panelRef.current
    if (!panel) return
    const previouslyFocused = document.activeElement

    const focusables = () => Array.from(panel.querySelectorAll(FOCUSABLE))
      .filter(el => el.offsetParent !== null) // solo los visibles

    const first = focusables()[0]
    if (first) first.focus()
    else panel.focus()

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose?.()
        return
      }
      if (e.key !== 'Tab') return
      const items = focusables()
      if (!items.length) return
      const firstEl = items[0], lastEl = items[items.length - 1]
      if (e.shiftKey && document.activeElement === firstEl) {
        e.preventDefault(); lastEl.focus()
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault(); firstEl.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      if (previouslyFocused instanceof HTMLElement && document.contains(previouslyFocused)) {
        previouslyFocused.focus()
      }
    }
  }, [onClose])

  return panelRef
}
