import { useState } from 'react'
import { ChevronRight, Monitor } from 'lucide-react'
import { formatCOP } from '../lib/format.js'
import EmptyState from './EmptyState.jsx'
import PaymentMethodChips from './PaymentMethodChips.jsx'
import ProgressBar from './ProgressBar.jsx'
import RankBadge from './RankBadge.jsx'
import RegisterDetailModal from './RegisterDetailModal.jsx'

export default function RegisterComparison({ data, loading, from, to, locationId }) {
  const [selected, setSelected] = useState(null)

  if (loading && !data?.length) {
    return (
      <div className="grid gap-3 md:grid-cols-2">
        {[1, 2].map(i => <div key={i} className="skeleton h-32 rounded-xl" />)}
      </div>
    )
  }

  if (!data?.length) {
    return <EmptyState compact icon={Monitor} title="Sin cobros por caja en este período" />
  }

  const maxRevenue = Math.max(...data.map(r => r.total), 1)

  return (
    <>
      <ol className={`grid gap-3 transition-opacity md:grid-cols-2 2xl:grid-cols-3 ${loading ? 'opacity-60' : ''}`}>
        {data.map((reg, idx) => {
          const clickable = reg.register_id !== null
          const Wrapper = clickable ? 'button' : 'div'

          return (
            <li key={reg.register_id || idx}>
              <Wrapper
                {...(clickable ? { type: 'button', onClick: () => setSelected(reg), title: 'Ver detalle de la caja' } : {})}
                className={`card group flex h-full w-full items-start gap-3 bg-surface-300 text-left ${clickable ? 'cursor-pointer transition-colors hover:border-white/10 hover:bg-surface-200' : ''}`}
              >
                <RankBadge rank={idx + 1} />

                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="flex min-w-0 items-center gap-1.5 text-sm font-medium text-white">
                      <Monitor className="h-4 w-4 shrink-0 text-gray-400" />
                      <span className="truncate">{reg.register_name}</span>
                    </p>
                    <p className="shrink-0 font-mono text-sm font-semibold tabular-nums text-white">{formatCOP(reg.total)}</p>
                  </div>
                  <p className="mt-0.5 text-2xs text-gray-400">
                    {reg.count} cobro{reg.count !== 1 ? 's' : ''} · Ticket prom. {formatCOP(reg.avg_ticket)}
                    {reg.cashier_name && <span> · {reg.cashier_name}</span>}
                  </p>
                  <div className="mt-2">
                    <ProgressBar pct={(reg.total / maxRevenue) * 100} />
                  </div>
                  <div className="mt-2">
                    <PaymentMethodChips byMethod={reg.by_method} />
                  </div>
                </div>

                {clickable && (
                  <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-gray-500 transition-colors group-hover:text-gray-300" aria-hidden="true" />
                )}
              </Wrapper>
            </li>
          )
        })}
      </ol>

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
