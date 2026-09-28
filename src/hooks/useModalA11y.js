import { useEffect, useRef, useState } from 'react'

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
 * Es un callback ref: el hook puede llamarse cuando el panel todavía no está
 * montado (p. ej. la hoja del carrito en VendedorPage) y se activa al aparecer.
 */
export function useModalA11y(onClose) {
  const [panel, setPanel] = useState(null)
  // onClose suele llegar como función inline (nueva en cada render del padre).
  // Con una ref el efecto corre solo al montar/desmontar el panel: si
  // dependiera de onClose, cada re-render devolvería el foco al botón que abrió
  // el modal y lo mandaría al primer campo, en medio de lo que se escribe.
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    if (!panel) return
    const previouslyFocused = document.activeElement

    const focusables = () => Array.from(panel.querySelectorAll(FOCUSABLE))
      .filter(el => el.offsetParent !== null) // solo los visibles

    // Foco inicial: respeta un autoFocus que ya haya ocurrido dentro del
    // panel; si no, el primer control marcado con data-autofocus o el primer
    // enfocable que no sea el botón de cerrar (la "X" del encabezado va
    // primero en el DOM, pero el usuario quiere empezar por el formulario).
    if (!panel.contains(document.activeElement)) {
      const items = focusables()
      const first = panel.querySelector('[data-autofocus]')
        || items.find(el => !el.hasAttribute('data-modal-close'))
        || items[0]
      if (first) first.focus()
      else panel.focus()
    }

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onCloseRef.current?.()
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
  }, [panel])

  return setPanel
}
