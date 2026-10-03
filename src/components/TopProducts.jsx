import { PackageSearch } from 'lucide-react'
import { formatCOP } from '../lib/format.js'
import EmptyState from './EmptyState.jsx'
import ProgressBar from './ProgressBar.jsx'
import RankBadge from './RankBadge.jsx'

/** Top productos. `embedded`: solo las filas, para vivir dentro de otro panel. */
export default function TopProducts({ data, loading, embedded = false }) {
  if (loading && !data?.length) {
    return <div className="skeleton h-64 rounded-xl" />
  }

  if (!data?.length) {
    return <EmptyState compact icon={PackageSearch} title="Sin ventas en este período" />
  }

  const maxRevenue = Math.max(...data.map(p => p.total_revenue), 1)

  return (
    <ol className={`divide-y divide-white/5 transition-opacity ${embedded ? '' : 'panel overflow-hidden'} ${loading ? 'opacity-60' : ''}`}>
      {data.map((product, idx) => (
        <li key={product.product_id || idx} className="list-row items-start !py-2.5">
          <RankBadge rank={idx + 1} />

          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-3">
              <p className="truncate text-sm font-medium text-white">{product.product_name}</p>
              <p className="shrink-0 font-mono text-sm font-semibold tabular-nums text-white">{formatCOP(product.total_revenue)}</p>
            </div>
            <div className="mt-0.5 flex items-baseline justify-between gap-3 text-2xs text-gray-400">
              <span className="truncate">
                {product.presentations?.map(pres => `${pres.label} ×${pres.qty}`).join(' · ')}
              </span>
              <span className="shrink-0 font-mono tabular-nums">{product.total_qty} uds</span>
            </div>
            <div className="mt-1.5">
              <ProgressBar pct={(product.total_revenue / maxRevenue) * 100} height="xs" />
            </div>
          </div>
        </li>
      ))}
    </ol>
  )
}
