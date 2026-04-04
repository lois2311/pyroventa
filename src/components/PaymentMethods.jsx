import { formatCOP } from '../lib/format.js'
import { ArrowRightLeft, Banknote, CheckCircle2, CreditCard, Loader2 } from 'lucide-react'

const METHODS = [
  {
    id:    'cash',
    label: 'Efectivo',
    Icon:  Banknote,
    bg:    'bg-green-600  hover:bg-green-500  border-green-500/40',
    ring:  'ring-green-500/30',
  },
  {
    id:    'transfer',
    label: 'Transferencia',
    Icon:  ArrowRightLeft,
    bg:    'bg-blue-600   hover:bg-blue-500   border-blue-500/40',
    ring:  'ring-blue-500/30',
  },
  {
    id:    'card',
    label: 'Datáfono',
    Icon:  CreditCard,
    bg:    'bg-violet-600 hover:bg-violet-500 border-violet-500/40',
    ring:  'ring-violet-500/30',
  },
]

export default function PaymentMethods({ total, selected, onSelect, onConfirm, loading }) {
  return (
    <div className="space-y-3 animate-fade-in">
      <p className="text-sm text-gray-400 font-medium">Método de pago</p>

      {/* Botones de método */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        {METHODS.map(m => {
          const Icon = m.Icon
          return (
          <button
            key={m.id}
            onClick={() => onSelect(m.id)}
            className={`
              flex flex-col items-center gap-1.5 p-3 sm:p-4 rounded-xl border-2 transition-all duration-150 cursor-pointer min-h-[72px]
              ${selected === m.id
                ? `${m.bg} border-opacity-100 ring-2 ${m.ring} text-white scale-[1.02]`
                : 'bg-surface-300 border-white/5 text-gray-400 hover:border-white/15 hover:text-white'
              }
            `}
          >
            <Icon className="w-6 h-6" />
            <span className="text-xs font-medium">{m.label}</span>
          </button>
          )
        })}
      </div>

      {/* Botón cobrar */}
      {selected && (
        <button
          onClick={onConfirm}
          disabled={loading}
          className="btn btn-success btn-lg w-full animate-slide-up text-base"
        >
          {loading ? (
            <span className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Procesando...
            </span>
          ) : (
            <span className="inline-flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" />
              Cobrar {formatCOP(total)}
            </span>
          )}
        </button>
      )}
    </div>
  )
}
