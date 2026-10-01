import { CheckCircle2 } from 'lucide-react'
import { formatCOP, timeAgo, invoiceUrgency } from '../lib/format.js'

const URGENCY_STYLES = {
  fresh:   'bg-green-400/15  text-green-400  border-green-400/30',
  warning: 'bg-yellow-400/15 text-yellow-400 border-yellow-400/30',
  urgent:  'bg-red-400/15    text-red-400    border-red-400/30',
}

export default function PendingList({ invoices, selectedId, onSelect }) {
  if (!invoices.length) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center p-6 text-gray-400">
        <CheckCircle2 className="w-8 h-8 mb-2" />
        <p className="text-sm font-medium">Nada pendiente.</p>
        <p className="text-xs mt-1">Las facturas nuevas llegan aquí solas.</p>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto flex flex-col gap-1.5 p-3">
      {invoices.map(inv => {
        const urgency = invoiceUrgency(inv.created_at)
        const isSelected = inv.id === selectedId

        return (
          <button
            key={inv.id}
            onClick={() => onSelect(inv)}
            aria-current={isSelected ? 'true' : undefined}
            className={`
              w-full text-left p-3 rounded-lg border transition-colors duration-100
              ${isSelected
                ? 'row-active bg-brand-500/10 border-brand-500/40'
                : 'bg-surface-300 border-white/5 hover:border-white/15 hover:bg-surface-200'
              }
            `}
          >
            {/* Código + urgencia */}
            <div className="flex items-center justify-between mb-1.5">
              <span className="font-mono font-bold text-xl text-white tracking-widest">
                {inv.code}
              </span>
              <span className={`text-xs px-2 py-0.5 rounded-lg border font-medium ${URGENCY_STYLES[urgency]}`}>
                {timeAgo(inv.created_at)}
              </span>
            </div>

            {/* Vendedor + total */}
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="min-w-0 truncate text-gray-400">
                {inv.seller_name || 'Sin vendedor'}
              </span>
              <span className="font-semibold font-mono text-brand-400">
                {formatCOP(inv.total)}
              </span>
            </div>
          </button>
        )
      })}
    </div>
  )
}
