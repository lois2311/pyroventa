import { useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { useModalA11y } from '../hooks/useModalA11y.js'

/**
 * Panel lateral derecho (alto completo). Mismo comportamiento de diálogo que
 * <Modal>: foco atrapado, Escape cierra, devuelve el foco a quien lo abrió y
 * el fondo no se desplaza. En pantallas angostas ocupa todo el ancho.
 */
export default function Drawer({ title, description, icon: Icon, onClose, children, footer, closeOnBackdrop = false }) {
  const titleId = useId()
  const panelRef = useModalA11y(onClose)
  const downOnBackdrop = useRef(false)

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  return createPortal(
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/70 animate-fade-in"
      onMouseDown={e => { downOnBackdrop.current = e.target === e.currentTarget }}
      onClick={e => {
        e.stopPropagation()
        if (closeOnBackdrop && downOnBackdrop.current && e.target === e.currentTarget) onClose()
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="flex h-full w-full flex-col border-l border-white/10 bg-surface-200 sm:max-w-xl"
      >
        <header className="flex items-start justify-between gap-3 border-b border-white/5 px-5 py-4">
          <div className="min-w-0">
            <h2 id={titleId} className="flex items-center gap-2 font-display text-lg font-semibold text-white">
              {Icon && <Icon className="h-5 w-5 shrink-0 text-brand-400" />}
              <span className="min-w-0">{title}</span>
            </h2>
            {description && <p className="mt-1 text-sm text-gray-400">{description}</p>}
          </div>
          <button type="button" onClick={onClose} data-modal-close className="btn btn-ghost btn-icon -mr-2 text-gray-400" aria-label="Cerrar">
            <X className="h-5 w-5" />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <footer className="border-t border-white/5 bg-surface-200 px-5 py-4">{footer}</footer>}
      </div>
    </div>,
    document.body,
  )
}
