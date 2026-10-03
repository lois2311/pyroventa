import { useState } from 'react'
import { ChevronRight, Monitor } from 'lucide-react'
import { formatCOP } from '../lib/format.js'
import EmptyState from './EmptyState.jsx'
import PaymentMethodChips from './PaymentMethodChips.jsx'
import ProgressBar from './ProgressBar.jsx'
import RankBadge from './RankBadge.jsx'
import RegisterDetailModal from './RegisterDetailModal.jsx'

/** Rendimiento por caja. `embedded`: solo las filas, para vivir dentro de otro panel. */
export default function RegisterComparison({ data, loading, from, to, locationId, embedded = false }) {
  const [selected, setSelected] = useState(null)

  if (loading && !data?.length) {
    return <div className="skeleton h-40 rounded-xl" />
  }

  if (!data?.length) {
    return <EmptyState compact icon={Monitor} title="Sin cobros por caja en este período" />
  }

  const maxRevenue = Math.max(...data.map(r => r.total), 1)

  return (
    <>
      <ol className={`divide-y divide-white/5 transition-opacity ${embedded ? '' : 'panel overflow-hidden'} ${loading ? 'opacity-60' : ''}`}>
        {data.map((reg, idx) => {
          const clickable = reg.register_id !== null
          const Wrapper = clickable ? 'button' : 'div'

          return (
            <li key={reg.register_id || idx}>
              <Wrapper
                {...(clickable ? { type: 'button', onClick: () => setSelected(reg), title: 'Ver detalle de la caja' } : {})}
                className={`list-row group w-full items-start !py-2.5 text-left ${clickable ? 'cursor-pointer transition-colors hover:bg-white/[0.03]' : ''}`}
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
                    <span className="font-mono tabular-nums">{reg.count}</span> cobro{reg.count !== 1 ? 's' : ''} · Ticket prom. <span className="font-mono tabular-nums">{formatCOP(reg.avg_ticket)}</span>
                    {reg.cashier_name && <span> · {reg.cashier_name}</span>}
                  </p>
                  <div className="mt-1.5">
                    <ProgressBar pct={(reg.total / maxRevenue) * 100} height="xs" />
                  </div>
                  <div className="mt-1.5">
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
