import { useId } from 'react'
import { formatCOP, TRANSFER_PROVIDERS } from '../lib/format.js'
import { suggestCashAmounts } from '../lib/cash.js'
import { ArrowRightLeft, Banknote, CheckCircle2, CreditCard, Loader2, Wallet } from 'lucide-react'
import Kbd from './Kbd.jsx'

// Tonos -700 con texto blanco: los -600 daban 3.3:1 (falla AA); -700 pasa (≥5:1).
// Datáfono en rosa (antes violeta): con daltonismo el violeta no se distinguía
// del azul de transferencia (ver chartTheme.js).
// `key`: atajo de teclado (lo escucha CajaPage, ver PAY_SHORTCUTS).
export const METHODS = [
  {
    id:    'cash',
    label: 'Efectivo',
    key:   '1',
    Icon:  Banknote,
    bg:    'bg-green-700  hover:bg-green-800  border-green-500/40',
    ring:  'ring-green-500/30',
  },
  {
    id:    'transfer',
    label: 'Transferencia',
    key:   '2',
    Icon:  ArrowRightLeft,
    bg:    'bg-blue-700   hover:bg-blue-800   border-blue-500/40',
    ring:  'ring-blue-500/30',
  },
  {
    id:    'card',
    label: 'Datáfono',
    key:   '3',
    Icon:  CreditCard,
    bg:    'bg-pink-700   hover:bg-pink-800   border-pink-500/40',
    ring:  'ring-pink-500/30',
  },
]

// Inicial de cada proveedor de transferencia: N, D, B
export const PROVIDER_KEYS = Object.fromEntries(TRANSFER_PROVIDERS.map(p => [p.id, p.label[0].toUpperCase()]))

export default function PaymentMethods({
  total, selected, onSelect, onConfirm, loading, cashReceived, onCashReceived,
  transferProvider, onTransferProvider,
}) {
  const fid = useId()
  const received = cashReceived === '' || cashReceived === undefined ? null : Number(cashReceived)
  const change = received !== null && !isNaN(received) ? received - total : null
  // Si escribió cuánto recibió y no alcanza, no dejar cobrar
  const insufficientCash = selected === 'cash' && change !== null && change < 0
  // La transferencia exige saber por dónde entró la plata para cuadrar caja
  const missingProvider = selected === 'transfer' && !transferProvider
  const quickCash = selected === 'cash' ? suggestCashAmounts(total) : []

  return (
    <div className="space-y-3 animate-fade-in">
      <p id={`${fid}-methods`} className="text-sm text-gray-400 font-medium">Método de pago</p>

      {/* Botones de método */}
      <div role="group" aria-labelledby={`${fid}-methods`} className="grid grid-cols-3 gap-2 sm:gap-3">
        {METHODS.map(m => {
          const Icon = m.Icon
          return (
          <button
            key={m.id}
            type="button"
            onClick={() => onSelect(m.id)}
            aria-pressed={selected === m.id}
            aria-keyshortcuts={m.key}
            className={`
              relative flex flex-col items-center gap-1.5 p-3 sm:p-4 rounded-xl border-2 transition-all duration-150 cursor-pointer min-h-[72px]
              ${selected === m.id
                ? `${m.bg} border-opacity-100 ring-2 ${m.ring} text-white scale-[1.02]`
                : 'bg-surface-300 border-white/5 text-gray-400 hover:border-white/15 hover:text-white'
              }
            `}
          >
            <Kbd className="absolute right-1.5 top-1.5">{m.key}</Kbd>
            <Icon className="w-6 h-6" />
            <span className="text-xs font-medium">{m.label}</span>
          </button>
          )
        })}
      </div>

      {/* Transferencia: por dónde entró la plata */}
      {selected === 'transfer' && (
        <div className="animate-fade-in">
          <p id={`${fid}-providers`} className="text-2xs text-gray-400 uppercase tracking-wider mb-1.5">¿Por dónde llegó la transferencia?</p>
          <div role="group" aria-labelledby={`${fid}-providers`} className="grid grid-cols-3 gap-2">
            {TRANSFER_PROVIDERS.map(p => (
              <button
                key={p.id}
                type="button"
                onClick={() => onTransferProvider(p.id)}
                aria-pressed={transferProvider === p.id}
                aria-keyshortcuts={PROVIDER_KEYS[p.id]}
                className={`
                  flex min-h-[var(--control-h)] items-center justify-center gap-1.5 px-2 py-2 rounded-lg border-2 text-xs font-medium transition-all duration-150 cursor-pointer
                  ${transferProvider === p.id
                    ? 'bg-blue-700 border-blue-500 ring-2 ring-blue-500/30 text-white'
                    : 'bg-surface-300 border-white/5 text-gray-400 hover:border-white/15 hover:text-white'
                  }
                `}
              >
                {p.label}
                <Kbd>{PROVIDER_KEYS[p.id]}</Kbd>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Efectivo: calcular el cambio */}
      {selected === 'cash' && onCashReceived && (
        <div className="cq animate-fade-in">
          <label htmlFor={`${fid}-cash`} className="block text-2xs text-gray-400 uppercase tracking-wider mb-1">
            ¿Con cuánto paga el cliente? (opcional)
          </label>
          <input
            id={`${fid}-cash`}
            type="number"
            inputMode="numeric"
            min="0"
            value={cashReceived}
            onChange={e => onCashReceived(e.target.value)}
            placeholder={String(total)}
            className="input font-mono"
          />
          {/* Billetes probables: un toque en vez de teclear el monto */}
          <div className="quick-cash mt-2" role="group" aria-label="Montos rápidos">
            {[total, ...quickCash].map((amount, i) => {
              const active = received === amount
              return (
                <button
                  key={amount}
                  type="button"
                  onClick={() => onCashReceived(String(amount))}
                  aria-pressed={active}
                  className={`min-h-[var(--control-h-sm)] whitespace-nowrap rounded-lg border px-1.5 font-mono text-xs font-medium tabular-nums transition-colors
                    ${active
                      ? 'border-green-500/60 bg-green-500/15 text-green-300'
                      : 'border-white/10 bg-surface-300 text-gray-300 hover:border-white/20 hover:text-white'}`}
                >
                  {i === 0 ? 'Exacto' : formatCOP(amount)}
                </button>
              )
            })}
          </div>
          {change !== null && !isNaN(change) && (
            change >= 0 ? (
              <div className="mt-2 bg-green-500/10 border border-green-500/30 rounded-lg px-3 py-2 flex items-center justify-between" aria-live="polite">
                <span className="text-xs text-green-300 font-medium inline-flex items-center gap-1.5">
                  <Wallet className="w-3.5 h-3.5" /> Cambio a devolver
                </span>
                <span className="font-mono font-bold text-green-400 text-lg">{formatCOP(change)}</span>
              </div>
            ) : (
              <p className="text-xs text-red-400 mt-1.5" aria-live="polite">Faltan {formatCOP(-change)} — el efectivo no alcanza</p>
            )
          )}
        </div>
      )}

      {/* Botón cobrar */}
      {selected && (
        <button
          type="button"
          onClick={onConfirm}
          disabled={loading || insufficientCash || missingProvider}
          aria-keyshortcuts="Enter"
          className="btn btn-success btn-lg w-full animate-slide-up text-base disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {missingProvider ? (
            <span className="inline-flex items-center gap-2">
              Elige Nequi, Daviplata o Bancolombia
            </span>
          ) : loading ? (
            <span className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Procesando...
            </span>
          ) : (
            <span className="inline-flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" />
              Cobrar {formatCOP(total)}
              <Kbd className="border-white/30 bg-black/20 text-white/80">Enter</Kbd>
            </span>
          )}
        </button>
      )}
    </div>
  )
}
