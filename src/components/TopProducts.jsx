import { formatCOP } from '../lib/format.js'

const MEDALS = ['🥇', '🥈', '🥉']

export default function TopProducts({ data, loading }) {
  if (loading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3, 4, 5].map(i => <div key={i} className="skeleton h-16 rounded-xl" />)}
      </div>
    )
  }

  if (!data?.length) {
    return <p className="text-gray-400 text-sm">Sin ventas registradas para este período.</p>
  }

  const maxRevenue = Math.max(...data.map(p => p.total_revenue), 1)

  return (
    <div className="space-y-2">
      {data.map((product, idx) => {
        const pct = (product.total_revenue / maxRevenue) * 100

        return (
          <div key={product.product_id || idx} className="card bg-surface-300">
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
                <p className="font-medium text-white text-sm truncate">{product.product_name}</p>
                <div className="flex flex-wrap gap-1 mt-1">
                  {product.presentations?.map((pres, i) => (
                    <span key={i} className="text-[10px] bg-surface-50 text-gray-500 px-1.5 py-0.5 rounded">
                      {pres.label} x{pres.qty}
                    </span>
                  ))}
                </div>
              </div>

              {/* Metrics */}
              <div className="text-right shrink-0">
                <p className="font-mono font-semibold text-brand-400 text-sm">{formatCOP(product.total_revenue)}</p>
                <p className="text-[10px] text-gray-400">{product.total_qty} uds vendidas</p>
              </div>
            </div>

            {/* Revenue bar */}
            <div className="h-1 bg-surface-50 rounded-full overflow-hidden mt-2">
              <div
                className="h-full bg-gradient-to-r from-brand-600 to-brand-400 rounded-full transition-all duration-700"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}
