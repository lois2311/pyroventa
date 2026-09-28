import { useEffect } from 'react'

/**
 * "/" enfoca el buscador (convención de GitHub, Gmail, YouTube…). No actúa
 * mientras se escribe en otro campo, con un diálogo abierto ni con Ctrl/Alt/⌘.
 * El input debe llevar aria-keyshortcuts="/" para anunciarlo.
 */
export function useSlashFocus(ref) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return
      if (e.target.closest?.('input, textarea, select, [contenteditable="true"]')) return
      if (document.querySelector('[role="dialog"]')) return
      e.preventDefault()
      ref.current?.focus()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [ref])
}
