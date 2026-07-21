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

export default function PaymentMethods({ total, selected, onSelect, onConfirm, loading, cashReceived, onCashReceived }) {
  const received = cashReceived === '' || cashReceived === undefined ? null : Number(cashReceived)
  const change = received !== null && !isNaN(received) ? received - total : null
  // Si escribió cuánto recibió y no alcanza, no dejar cobrar
  const insufficientCash = selected === 'cash' && change !== null && change < 0

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

      {/* Efectivo: calcular el cambio */}
      {selected === 'cash' && onCashReceived && (
        <div className="animate-fade-in">
          <label className="block text-[10px] text-gray-400 uppercase tracking-wider mb-1">
            ¿Con cuánto paga el cliente? (opcional)
          </label>
          <input
            type="number"
            inputMode="numeric"
            min="0"
            value={cashReceived}
            onChange={e => onCashReceived(e.target.value)}
            placeholder={String(total)}
            className="input font-mono"
          />
          {change !== null && !isNaN(change) && (
            change >= 0 ? (
              <div className="mt-2 bg-green-500/10 border border-green-500/30 rounded-lg px-3 py-2 flex items-center justify-between">
                <span className="text-xs text-green-300 font-medium">💵 Cambio a devolver</span>
                <span className="font-mono font-bold text-green-400 text-lg">{formatCOP(change)}</span>
              </div>
            ) : (
              <p className="text-xs text-red-400 mt-1.5">Faltan {formatCOP(-change)} — el efectivo no alcanza</p>
            )
          )}
        </div>
      )}

      {/* Botón cobrar */}
      {selected && (
        <button
          onClick={onConfirm}
          disabled={loading || insufficientCash}
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
