import { useState } from 'react'
import { Monitor } from 'lucide-react'
import { formatCOP } from '../lib/format.js'
import PaymentMethodChips from './PaymentMethodChips.jsx'
import ProgressBar from './ProgressBar.jsx'
import RankBadge from './RankBadge.jsx'
import RegisterDetailModal from './RegisterDetailModal.jsx'

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
    return <p className="text-gray-400 text-sm">Sin cobros registrados por caja en este período.</p>
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
                <RankBadge rank={idx + 1} />

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <Monitor className="w-4 h-4 text-gray-400" />
                    <p className="font-medium text-white text-sm">{reg.register_name}</p>
                  </div>
                  <p className="text-[10px] text-gray-400 ml-6">
                    {reg.count} cobro{reg.count !== 1 ? 's' : ''} · Ticket prom: {formatCOP(reg.avg_ticket)}
                    {reg.cashier_name && <span> · Cajero(a): {reg.cashier_name}</span>}
                  </p>
                </div>

                {/* Revenue */}
                <div className="text-right shrink-0">
                  <p className="font-mono font-semibold text-brand-400 text-sm">{formatCOP(reg.total)}</p>
                </div>
              </div>

              <div className="mt-2">
                <ProgressBar pct={pct} />
              </div>

              <div className="mt-2">
                <PaymentMethodChips byMethod={reg.by_method} />
              </div>

              {clickable && <p className="text-[10px] text-gray-400 mt-1">Click para ver detalle →</p>}
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
