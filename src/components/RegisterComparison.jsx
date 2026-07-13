import { useState } from 'react'
import { formatCOP } from '../lib/format.js'
import RegisterDetailModal from './RegisterDetailModal.jsx'

const METHOD_BADGE = {
  cash:     'bg-green-500/20  text-green-400',
  transfer: 'bg-blue-500/20   text-blue-400',
  card:     'bg-violet-500/20 text-violet-400',
}

const MEDALS = ['🥇', '🥈', '🥉']

export default function RegisterComparison({ data, loading, from, to, locationId }) {
  const [selected, setSelected] = useState(null)

  if (loading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map(i => <div key={i} className="skeleton h-24 rounded-xl" />)}
      </div>
    )
  }

  if (!data?.length) {
    return <p className="text-gray-600 text-sm">Sin cobros registrados por caja en este período.</p>
  }

  const maxRevenue = Math.max(...data.map(r => r.total), 1)

  return (
    <>
      <div className="space-y-2">
        {data.map((reg, idx) => {
          const pct = (reg.total / maxRevenue) * 100
          const clickable = reg.register_id !== null
          const Wrapper = clickable ? 'button' : 'div'

          return (
            <Wrapper
              key={reg.register_id || idx}
              {...(clickable ? { onClick: () => setSelected(reg) } : {})}
              className={`card bg-surface-300 w-full text-left ${clickable ? 'hover:bg-surface-200 transition-colors cursor-pointer' : ''}`}
            >
              <div className="flex items-center gap-3">
                {/* Ranking */}
                <div className="w-8 text-center shrink-0">
                  {idx < 3 ? (
                    <span className="text-xl">{MEDALS[idx]}</span>
                  ) : (
                    <span className="text-sm font-mono font-bold text-gray-600">#{idx + 1}</span>
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">🖥</span>
                    <p className="font-medium text-white text-sm">{reg.register_name}</p>
                  </div>
                  <p className="text-[10px] text-gray-600 ml-7">
                    {reg.count} cobro{reg.count !== 1 ? 's' : ''} · Ticket prom: {formatCOP(reg.avg_ticket)}
                    {reg.cashier_name && <span> · Cajero(a): {reg.cashier_name}</span>}
                  </p>
                </div>

                {/* Revenue */}
                <div className="text-right shrink-0">
                  <p className="font-mono font-semibold text-brand-400 text-sm">{formatCOP(reg.total)}</p>
                </div>
              </div>

              {/* Revenue bar */}
              <div className="h-1.5 bg-surface-50 rounded-full overflow-hidden mt-2">
                <div
                  className="h-full bg-gradient-to-r from-brand-600 to-brand-400 rounded-full transition-all duration-700"
                  style={{ width: `${pct}%` }}
                />
              </div>

              {/* Payment methods */}
              <div className="flex flex-wrap gap-1 mt-2">
                {reg.by_method.cash > 0 && (
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${METHOD_BADGE.cash}`}>
                    💵 {formatCOP(reg.by_method.cash)}
                  </span>
                )}
                {reg.by_method.transfer > 0 && (
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${METHOD_BADGE.transfer}`}>
                    🔁 {formatCOP(reg.by_method.transfer)}
                  </span>
                )}
                {reg.by_method.card > 0 && (
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${METHOD_BADGE.card}`}>
                    💳 {formatCOP(reg.by_method.card)}
                  </span>
                )}
              </div>

              {clickable && <p className="text-[10px] text-gray-700 mt-1">Click para ver detalle →</p>}
            </Wrapper>
          )
        })}
      </div>

      {selected && (
        <RegisterDetailModal
          registerId={selected.register_id}
          registerName={selected.register_name}
          from={from} to={to} locationId={locationId}
          onClose={() => setSelected(null)}
        />
      )}
    </>
  )
}
