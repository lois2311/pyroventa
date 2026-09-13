import { useState } from 'react'
import { formatCOP } from '../lib/format.js'
import PaymentMethodChips from './PaymentMethodChips.jsx'
import ProgressBar from './ProgressBar.jsx'
import RankBadge from './RankBadge.jsx'
import SellerDetailModal from './SellerDetailModal.jsx'

export default function SellerStats({ data, loading, from, to, locationId }) {
  const [selectedSeller, setSelectedSeller] = useState(null)

  if (loading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3, 4].map(i => <div key={i} className="skeleton h-20 rounded-xl" />)}
      </div>
    )
  }

  if (!data?.length) {
    return <p className="text-gray-400 text-sm">Sin ventas registradas para este período.</p>
  }

  const maxRevenue = Math.max(...data.map(s => s.total), 1)

  return (
    <>
      <div className="space-y-2">
        {data.map((s, idx) => {
          const pct = (s.total / maxRevenue) * 100

          return (
            <button
              key={s.seller_id || idx}
              onClick={() => setSelectedSeller(s)}
              className="card bg-surface-300 w-full text-left hover:bg-surface-200 transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <RankBadge rank={idx + 1} />

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-white text-sm">{s.seller_name}</p>
                  <p className="text-[10px] text-gray-400">
                    {s.count} factura{s.count !== 1 ? 's' : ''} · Ticket prom: {formatCOP(s.avg_ticket)}
                  </p>
                </div>

                {/* Revenue */}
                <div className="text-right shrink-0">
                  <p className="font-mono font-semibold text-brand-400 text-sm">{formatCOP(s.total)}</p>
                </div>
              </div>

              <div className="mt-2">
                <ProgressBar pct={pct} height="xs" />
              </div>

              <div className="mt-2">
                <PaymentMethodChips byMethod={s.by_method} />
              </div>

              <p className="text-[10px] text-gray-400 mt-1">Click para ver detalle →</p>
            </button>
          )
        })}
      </div>

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
