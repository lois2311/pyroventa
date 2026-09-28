import { useEffect, useId } from 'react'
import { formatCOP } from '../lib/format.js'
import { useModalA11y } from '../hooks/useModalA11y.js'

export default function SuccessAnimation({ invoice, onDone }) {
  const titleId = useId()
  const panelRef = useModalA11y(onDone)

  // Auto-dismiss después de 2.5s
  useEffect(() => {
    const t = setTimeout(onDone, 2500)
    return () => clearTimeout(t)
  }, [onDone])

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
      {/* Fondo: tocar fuera también continúa (fuera del orden de tabulación) */}
      <button
        type="button"
        tabIndex={-1}
        aria-label="Continuar"
        onClick={onDone}
        className="absolute inset-0 h-full w-full cursor-default"
      />
      <div
        ref={panelRef} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}
        className="relative bg-surface-300 border border-green-500/30 rounded-2xl p-8 max-w-xs w-full text-center shadow-2xl animate-scale-in"
      >
        {/* Checkmark SVG animado */}
        <div className="flex justify-center mb-4">
          <svg
            className="w-20 h-20 text-green-600"
            viewBox="0 0 52 52"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <circle
              className="checkmark-circle"
              cx="26" cy="26" r="25"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
            <path
              className="checkmark-path"
              d="M14 27l8 8 16-16"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>

        <h2 id={titleId} className="font-syne font-bold text-xl text-green-400 mb-1">¡Factura creada!</h2>

        {/* Código grande */}
        {invoice?.code && (
          <div className="my-3">
            <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Código</p>
            <div className="font-mono font-bold text-brand-400 text-5xl tracking-[0.2em]">
              {invoice.code}
            </div>
          </div>
        )}

        {invoice?.total && (
          <p className="text-white font-semibold text-lg mb-4">{formatCOP(invoice.total)}</p>
        )}

        {/* after:inset-0 estira el área del botón a toda la tarjeta: tocar
            en cualquier parte continúa, y con teclado es un botón normal */}
        <button
          type="button"
          onClick={onDone}
          data-autofocus
          className="text-xs text-gray-400 after:absolute after:inset-0 after:rounded-2xl after:content-[''] focus-visible:text-white"
        >
          Toca para continuar
        </button>
      </div>
    </div>
  )
}
