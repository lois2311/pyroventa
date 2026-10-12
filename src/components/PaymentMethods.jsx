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

// Pago mixto: una fila por método; el campo vacío sugiere lo que falta.
function SplitForm({ fid, total, amounts, onAmount, split, transferProvider, onTransferProvider }) {
  return (
    <div className="space-y-2 animate-fade-in">
      {METHODS.map(m => {
        const Icon = m.Icon
        const own = Number(amounts[m.id]) || 0
        const suggest = Math.max(0, total - (split.paid - own))
        const id = `${fid}-split-${m.id}`
        return (
          <div key={m.id}>
            <div className="flex items-center gap-2">
              <label htmlFor={id} className="flex w-28 shrink-0 items-center gap-1.5 text-xs font-medium text-gray-300">
                <Icon className="h-4 w-4" aria-hidden="true" /> {m.label}
              </label>
              <input
                id={id}
                data-split-input
                type="number"
                inputMode="numeric"
                min="0"
                value={amounts[m.id]}
                onChange={e => onAmount(m.id, e.target.value)}
                placeholder={String(suggest)}
                className={`input min-w-0 flex-1 text-right font-mono text-lg tabular-nums focus:border-2 ${own > 0 ? 'border-brand-500/60' : ''}`}
              />
              <button
                type="button"
                onClick={() => onAmount(m.id, String(suggest))}
                disabled={suggest === 0 || suggest === own}
                aria-label={`Completar con ${formatCOP(suggest)} en ${m.label}`}
                className="btn-outline min-h-[var(--control-h)] shrink-0 px-3 text-xs disabled:opacity-40"
              >
                Resto
              </button>
            </div>
            {m.id === 'transfer' && own > 0 && (
              <div role="group" aria-label="Proveedor de la transferencia" className="mt-1.5 grid grid-cols-3 gap-2">
                {TRANSFER_PROVIDERS.map(p => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => onTransferProvider(p.id)}
                    aria-pressed={transferProvider === p.id}
                    className={`press min-h-[var(--control-h)] rounded-lg border-2 px-2 text-xs font-medium cursor-pointer ${
                      transferProvider === p.id
                        ? 'border-brand-500 bg-surface-300 text-white'
                        : 'border-white/5 bg-surface-300 text-gray-400 hover:border-white/15 hover:text-white'}`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )
      })}

      <dl className="rounded-lg border border-white/5 bg-surface-300 px-3 py-2 font-mono tabular-nums text-sm" aria-live="polite">
        <div className="flex justify-between"><dt className="font-sans text-xs text-gray-400">Recibido</dt><dd>{formatCOP(split.paid)}</dd></div>
        <div className={`flex justify-between ${split.remaining > 0 ? 'text-red-400' : 'text-gray-300'}`}>
          <dt className="font-sans text-xs">Faltan</dt><dd className="font-bold">{formatCOP(split.remaining)}</dd>
        </div>
        {split.change > 0 && (
          <div className={`flex justify-between ${split.error === 'overpaid' ? 'text-red-400' : 'text-green-400'}`}>
            <dt className="font-sans text-xs">Cambio a devolver</dt><dd className="text-xl font-bold">{formatCOP(split.change)}</dd>
          </div>
        )}
      </dl>
      {split.error === 'overpaid' && (
        <p className="text-xs text-red-400">Sobra plata y el efectivo no alcanza para devolver el cambio.</p>
      )}
    </div>
  )
}

export default function PaymentMethods({
  total, selected, onSelect, onConfirm, loading, cashReceived, onCashReceived,
  transferProvider, onTransferProvider,
  mixed = false, onMixed, splitAmounts, onSplitAmount, split,
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
      <p id={`${fid}-methods`} className="eyebrow">Forma de pago</p>

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
              press relative flex flex-col items-center gap-1.5 p-3 sm:p-4 rounded-lg border-2 cursor-pointer min-h-[72px]
              ${selected === m.id
                ? `${m.bg} border-opacity-100 ring-2 ${m.ring} text-white`
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

      {onMixed && (
        <button
          type="button"
          onClick={onMixed}
          aria-pressed={mixed}
          aria-keyshortcuts="4"
          className={`press flex min-h-[var(--control-h)] w-full items-center justify-center gap-2 rounded-lg border-2 text-xs font-medium cursor-pointer ${
            mixed
              ? 'border-brand-500 bg-surface-300 text-white'
              : 'border-white/5 bg-surface-300 text-gray-400 hover:border-white/15 hover:text-white'}`}
        >
          Pago mixto <Kbd>4</Kbd>
        </button>
      )}

      {mixed && (
        <SplitForm fid={fid} total={total} amounts={splitAmounts} onAmount={onSplitAmount} split={split}
          transferProvider={transferProvider} onTransferProvider={onTransferProvider} />
      )}

      {/* Transferencia: por dónde entró la plata */}
      {selected === 'transfer' && (
        <div className="animate-fade-in">
          <p id={`${fid}-providers`} className="eyebrow mb-1.5">¿Por dónde llegó la transferencia?</p>
          <div role="group" aria-labelledby={`${fid}-providers`} className="grid grid-cols-3 gap-2">
            {TRANSFER_PROVIDERS.map(p => (
              <button
                key={p.id}
                type="button"
                onClick={() => onTransferProvider(p.id)}
                aria-pressed={transferProvider === p.id}
                aria-keyshortcuts={PROVIDER_KEYS[p.id]}
                className={`
                  press flex min-h-[var(--control-h)] items-center justify-center gap-1.5 px-2 py-2 rounded-lg border-2 text-xs font-medium cursor-pointer
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
          <label htmlFor={`${fid}-cash`} className="eyebrow mb-1 block">
            ¿Con cuánto paga el cliente? (opcional)
          </label>
          <input
            id={`${fid}-cash`}
            data-cash-input
            type="number"
            inputMode="numeric"
            min="0"
            value={cashReceived}
            onChange={e => onCashReceived(e.target.value)}
            placeholder={String(total)}
            className="input text-right font-mono text-lg tabular-nums"
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
                  className={`press min-h-[var(--control-h-sm)] whitespace-nowrap rounded-lg border px-1.5 font-mono text-xs font-medium tabular-nums transition-colors
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
                <span className="font-mono font-bold tabular-nums text-green-400 text-2xl text-right">{formatCOP(change)}</span>
              </div>
            ) : (
              <p className="text-xs text-red-400 mt-1.5" aria-live="polite">Faltan <span className="font-mono tabular-nums">{formatCOP(-change)}</span>. El efectivo no alcanza.</p>
            )
          )}
        </div>
      )}

      {/* Botón cobrar */}
      {(selected || mixed) && (
        <button
          type="button"
          onClick={onConfirm}
          disabled={loading || (mixed ? !split.ok : insufficientCash || missingProvider)}
          aria-keyshortcuts="F12 Enter"
          className="btn-primary btn-lg w-full animate-slide-up text-base disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {(mixed ? split.error === 'provider' : missingProvider) ? (
            <span className="inline-flex items-center gap-2">
              Elige Nequi, Daviplata o Bancolombia
            </span>
          ) : mixed && split.error === 'short' ? (
            <span className="font-mono tabular-nums">Faltan {formatCOP(split.remaining)}</span>
          ) : loading ? (
            <span className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Cobrando…
            </span>
          ) : (
            <span className="inline-flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" />
              Cobrar <span className="font-mono font-bold tabular-nums">{formatCOP(total)}</span>
              <Kbd className="kbd-on-fill">F12</Kbd>
            </span>
          )}
        </button>
      )}
    </div>
  )
}
