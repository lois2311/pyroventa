import { useEffect, useId } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { useModalA11y } from '../hooks/useModalA11y.js'

const SIZES = {
  sm: 'sm:max-w-sm',
  md: 'sm:max-w-md',
  lg: 'sm:max-w-lg',
  xl: 'sm:max-w-2xl',
}

/**
 * Diálogo modal estándar del proyecto. Antes cada formulario armaba su propio
 * overlay (z-index, opacidad del fondo, alineación y padding distintos) y los
 * del panel de plataforma ni atrapaban el foco ni cerraban con Escape.
 *
 * - Móvil: hoja inferior a todo el ancho; sm+: panel centrado de ancho `size`.
 * - Encabezado y pie quedan fijos (sticky) si el contenido es más alto que la
 *   pantalla; en móvil los botones del pie ocupan todo el ancho.
 * - `onSubmit` convierte cuerpo + pie en un <form>, así Enter envía.
 * - Se monta en <body> (portal): ningún ancestro con transform/overflow puede
 *   recortarlo ni cambiar su posición.
 * - `closeOnBackdrop={false}` para formularios largos: un toque fuera del panel
 *   no descarta lo escrito (Escape y la X siguen cerrando).
 */
export default function Modal({
  title, description, icon: Icon, onClose, children, footer,
  size = 'md', onSubmit, closeOnBackdrop = true, className = '',
}) {
  const titleId = useId()
  const descId = useId()
  const panelRef = useModalA11y(onClose)

  // Sin scroll del fondo mientras el diálogo está abierto
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  const Wrapper = onSubmit ? 'form' : 'div'
  const handleSubmit = onSubmit ? (e) => { e.preventDefault(); onSubmit(e) } : undefined

  return createPortal(
    <div className="modal-backdrop" onClick={closeOnBackdrop ? onClose : undefined}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        className={`modal-panel ${SIZES[size] || SIZES.md} ${className}`}
        onClick={e => e.stopPropagation()}
      >
        <header className="modal-header">
          <div className="min-w-0">
            <h2 id={titleId} className="modal-title">
              {Icon && <Icon className="w-5 h-5 shrink-0 text-brand-400" />}
              <span className="min-w-0">{title}</span>
            </h2>
            {description && <p id={descId} className="mt-1 text-sm text-gray-400">{description}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            data-modal-close
            className="btn btn-ghost btn-icon -mr-2 -mt-1 text-gray-400"
            aria-label="Cerrar"
          >
            <X className="w-5 h-5" />
          </button>
        </header>

        <Wrapper onSubmit={handleSubmit}>
          <div className="modal-body">{children}</div>
          {footer && <footer className="modal-footer">{footer}</footer>}
        </Wrapper>
      </div>
    </div>,
    document.body,
  )
}
