import { useEffect } from 'react'
import { formatCOP } from '../lib/format.js'

export default function SuccessAnimation({ invoice, onDone }) {
  // Auto-dismiss después de 2.5s
  useEffect(() => {
    const t = setTimeout(onDone, 2500)
    return () => clearTimeout(t)
  }, [onDone])

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in"
      onClick={onDone}
    >
      <div
        className="bg-surface-300 border border-green-500/30 rounded-2xl p-8 max-w-xs w-full text-center shadow-2xl animate-scale-in"
        onClick={e => e.stopPropagation()}
      >
        {/* Checkmark SVG animado */}
        <div className="flex justify-center mb-4">
          <svg
            className="w-20 h-20"
            viewBox="0 0 52 52"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <circle
              className="checkmark-circle"
              cx="26" cy="26" r="25"
              stroke="#22c55e"
              strokeWidth="2"
              strokeLinecap="round"
            />
            <path
              className="checkmark-path"
              d="M14 27l8 8 16-16"
              stroke="#22c55e"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>

        <h2 className="font-syne font-bold text-xl text-green-400 mb-1">¡Factura creada!</h2>

        {/* Código grande */}
        {invoice?.code && (
          <div className="my-3">
            <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Código</p>
            <div className="font-mono font-bold text-brand-400 text-5xl tracking-[0.2em]">
              {invoice.code}
            </div>
          </div>
        )}

        {invoice?.total && (
          <p className="text-white font-semibold text-lg mb-4">{formatCOP(invoice.total)}</p>
        )}

        <p className="text-gray-500 text-xs">Toca para continuar</p>
      </div>
    </div>
  )
}
