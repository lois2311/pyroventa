import { formatCOP, timeAgo, invoiceUrgency } from '../lib/format.js'

const URGENCY_STYLES = {
  fresh:   'bg-green-500/20  text-green-400  border-green-500/30',
  warning: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  urgent:  'bg-red-500/20    text-red-400    border-red-500/30',
}

export default function PendingList({ invoices, selectedId, onSelect }) {
  if (!invoices.length) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center p-6 text-gray-600">
        <span className="text-3xl mb-2">✅</span>
        <p className="text-sm font-medium">Sin facturas pendientes</p>
        <p className="text-xs mt-1">Las nuevas aparecerán aquí</p>
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
            className={`
              w-full text-left p-3 rounded-xl border transition-all duration-100
              ${isSelected
                ? 'bg-brand-500/20 border-brand-500/60'
                : 'bg-surface-300 border-white/5 hover:border-white/15 hover:bg-surface-200'
              }
            `}
          >
            {/* Código + urgencia */}
            <div className="flex items-center justify-between mb-1.5">
              <span className="font-mono font-bold text-xl text-white tracking-widest">
                {inv.code}
              </span>
              <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${URGENCY_STYLES[urgency]}`}>
                {timeAgo(inv.created_at)}
              </span>
            </div>

            {/* Vendedor + total */}
            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-500 truncate max-w-[100px]">
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
