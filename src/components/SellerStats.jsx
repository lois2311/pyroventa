import { useState } from 'react'
import { ChevronRight, UserRound } from 'lucide-react'
import { formatCOP } from '../lib/format.js'
import EmptyState from './EmptyState.jsx'
import PaymentMethodChips from './PaymentMethodChips.jsx'
import ProgressBar from './ProgressBar.jsx'
import RankBadge from './RankBadge.jsx'
import SellerDetailModal from './SellerDetailModal.jsx'

/** Top vendedores. `embedded`: solo las filas, para vivir dentro de otro panel. */
export default function SellerStats({ data, loading, from, to, locationId, embedded = false }) {
  const [selectedSeller, setSelectedSeller] = useState(null)

  if (loading && !data?.length) {
    return <div className="skeleton h-64 rounded-xl" />
  }

  if (!data?.length) {
    return <EmptyState compact icon={UserRound} title="Sin ventas en este período" />
  }

  const maxRevenue = Math.max(...data.map(s => s.total), 1)

  return (
    <>
      <ol className={`divide-y divide-white/5 transition-opacity ${embedded ? '' : 'panel overflow-hidden'} ${loading ? 'opacity-60' : ''}`}>
        {data.map((s, idx) => (
          <li key={s.seller_id || idx}>
            <button
              type="button"
              onClick={() => setSelectedSeller(s)}
              title="Ver detalle del vendedor"
              className="list-row group w-full items-start !py-2.5 text-left transition-colors hover:bg-white/[0.03]"
            >
              <RankBadge rank={idx + 1} />

              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="truncate text-sm font-medium text-white">{s.seller_name}</p>
                  <p className="shrink-0 font-mono text-sm font-semibold tabular-nums text-white">{formatCOP(s.total)}</p>
                </div>
                <p className="mt-0.5 text-2xs text-gray-400">
                  {s.count} factura{s.count !== 1 ? 's' : ''} · Ticket prom. <span className="font-mono tabular-nums">{formatCOP(s.avg_ticket)}</span>
                </p>
                <div className="mt-2">
                  <ProgressBar pct={(s.total / maxRevenue) * 100} height="xs" />
                </div>
                <div className="mt-2">
                  <PaymentMethodChips byMethod={s.by_method} />
                </div>
              </div>

              <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-gray-500 transition-colors group-hover:text-gray-300" aria-hidden="true" />
            </button>
          </li>
        ))}
      </ol>

      {selectedSeller && (
        <SellerDetailModal
          sellerId={selectedSeller.seller_id}
          sellerName={selectedSeller.seller_name}
          from={from}
          to={to}
          locationId={locationId}
          onClose={() => setSelectedSeller(null)}
        />
      )}
    </>
  )
}
