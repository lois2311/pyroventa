import { PackageSearch } from 'lucide-react'
import { formatCOP } from '../lib/format.js'
import EmptyState from './EmptyState.jsx'
import ProgressBar from './ProgressBar.jsx'
import RankBadge from './RankBadge.jsx'

export default function TopProducts({ data, loading }) {
  if (loading && !data?.length) {
    return <div className="skeleton h-80 rounded-xl" />
  }

  if (!data?.length) {
    return <EmptyState compact icon={PackageSearch} title="Sin ventas en este período" />
  }

  const maxRevenue = Math.max(...data.map(p => p.total_revenue), 1)

  return (
    <ol className={`panel divide-y divide-white/5 overflow-hidden transition-opacity ${loading ? 'opacity-60' : ''}`}>
      {data.map((product, idx) => (
        <li key={product.product_id || idx} className="list-row items-start">
          <RankBadge rank={idx + 1} />

          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-3">
              <p className="truncate text-sm font-medium text-white">{product.product_name}</p>
              <p className="shrink-0 font-mono text-sm font-semibold tabular-nums text-white">{formatCOP(product.total_revenue)}</p>
            </div>
            <div className="mt-1 flex items-start justify-between gap-3">
              <div className="flex min-w-0 flex-wrap gap-1">
                {product.presentations?.map((pres, i) => (
                  <span key={i} className="rounded bg-surface-50 px-1.5 py-0.5 text-2xs text-gray-400">
                    {pres.label} ×{pres.qty}
                  </span>
                ))}
              </div>
              <span className="shrink-0 text-2xs text-gray-400">{product.total_qty} uds</span>
            </div>
            <div className="mt-2">
              <ProgressBar pct={(product.total_revenue / maxRevenue) * 100} height="xs" />
            </div>
          </div>
        </li>
      ))}
    </ol>
  )
}
