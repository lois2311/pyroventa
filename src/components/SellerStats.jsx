import { useState } from 'react'
import { formatCOP } from '../lib/format.js'
import SellerDetailModal from './SellerDetailModal.jsx'

const METHOD_BADGE = {
  cash:     'bg-green-500/20  text-green-400',
  transfer: 'bg-blue-500/20   text-blue-400',
  card:     'bg-violet-500/20 text-violet-400',
}

const MEDALS = ['🥇', '🥈', '🥉']

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
                {/* Ranking */}
                <div className="w-8 text-center shrink-0">
                  {idx < 3 ? (
                    <span className="text-xl">{MEDALS[idx]}</span>
                  ) : (
                    <span className="text-sm font-mono font-bold text-gray-400">#{idx + 1}</span>
                  )}
                </div>

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

              {/* Revenue bar */}
              <div className="h-1 bg-surface-50 rounded-full overflow-hidden mt-2">
                <div
                  className="h-full bg-gradient-to-r from-brand-600 to-brand-400 rounded-full transition-all duration-700"
                  style={{ width: `${pct}%` }}
                />
              </div>

              {/* Payment methods breakdown */}
              <div className="flex flex-wrap gap-1 mt-2">
                {s.by_method.cash > 0 && (
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${METHOD_BADGE.cash}`}>
                    💵 {formatCOP(s.by_method.cash)}
                  </span>
                )}
                {s.by_method.transfer > 0 && (
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${METHOD_BADGE.transfer}`}>
                    🔁 {formatCOP(s.by_method.transfer)}
                  </span>
                )}
                {s.by_method.card > 0 && (
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${METHOD_BADGE.card}`}>
                    💳 {formatCOP(s.by_method.card)}
                  </span>
                )}
              </div>

              <p className="text-[10px] text-gray-500 mt-1">Click para ver detalle →</p>
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
