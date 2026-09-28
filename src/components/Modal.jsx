import { useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { useModalA11y } from '../hooks/useModalA11y.js'

const SIZES = {
  sm: 'sm:max-w-sm',
  md: 'sm:max-w-md',
  lg: 'sm:max-w-lg',
  xl: 'sm:max-w-2xl',
  '2xl': 'sm:max-w-3xl',
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
 * - `headerActions`: botones extra junto a la X (p. ej. exportar).
 * - Se monta en <body> (portal): ningún ancestro con transform/overflow puede
 *   recortarlo ni cambiar su posición.
 * - `closeOnBackdrop={false}` para formularios largos: un toque fuera del panel
 *   no descarta lo escrito (Escape y la X siguen cerrando).
 */
export default function Modal({
  title, description, icon: Icon, iconClassName = 'text-brand-400', headerActions,
  onClose, children, footer, size = 'md', onSubmit, closeOnBackdrop = true, className = '',
}) {
  const titleId = useId()
  const descId = useId()
  const panelRef = useModalA11y(onClose)
  const downOnBackdrop = useRef(false)

  // Sin scroll del fondo mientras el diálogo está abierto
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  const Wrapper = onSubmit ? 'form' : 'div'
  const handleSubmit = onSubmit ? (e) => { e.preventDefault(); onSubmit(e) } : undefined
  const hasBody = children !== null && children !== undefined && children !== false

  return createPortal(
    // Cerrar tocando el fondo es un atajo de mouse/dedo; con teclado se cierra
    // con Escape (useModalA11y), por eso el fondo no necesita rol ni teclas.
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
    <div
      className="modal-backdrop"
      onMouseDown={e => { downOnBackdrop.current = e.target === e.currentTarget }}
      onClick={e => {
        // Los eventos de un portal suben por el árbol de React: sin esto, un
        // clic dentro del modal llegaría a overlays de abajo (p. ej. la hoja
        // del carrito) y los cerraría.
        e.stopPropagation()
        // Solo si el clic empezó y terminó en el fondo: seleccionar texto en
        // un campo y soltar afuera no debe descartar el formulario.
        if (closeOnBackdrop && downOnBackdrop.current && e.target === e.currentTarget) onClose()
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        className={`modal-panel ${SIZES[size] || SIZES.md} ${className}`}
      >
        <header className="modal-header">
          <div className="min-w-0">
            <h2 id={titleId} className="modal-title">
              {Icon && <Icon className={`w-5 h-5 shrink-0 ${iconClassName}`} />}
              <span className="min-w-0">{title}</span>
            </h2>
            {description && <p id={descId} className="mt-1 text-sm text-gray-400">{description}</p>}
          </div>
          <div className="-mr-2 -mt-1 flex shrink-0 items-center gap-1">
            {headerActions}
            <button
              type="button"
              onClick={onClose}
              data-modal-close
              className="btn btn-ghost btn-icon text-gray-400"
              aria-label="Cerrar"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </header>

        <Wrapper onSubmit={handleSubmit}>
          {hasBody && <div className="modal-body">{children}</div>}
          {footer && <footer className="modal-footer">{footer}</footer>}
        </Wrapper>
      </div>
    </div>,
    document.body,
  )
}
