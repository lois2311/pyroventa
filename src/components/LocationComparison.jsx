import { Clock, MapPin, XCircle } from 'lucide-react'
import { formatCOP } from '../lib/format.js'
import EmptyState from './EmptyState.jsx'
import ProgressBar from './ProgressBar.jsx'
import RankBadge from './RankBadge.jsx'

/** Comparativa de puntos de venta. `embedded`: solo las filas, para vivir dentro de otro panel. */
export default function LocationComparison({ data, loading, embedded = false }) {
  if (loading && !data?.length) {
    return <div className="skeleton h-40 rounded-xl" />
  }

  if (!data?.length) {
    return <EmptyState compact icon={MapPin} title="Sin datos para mostrar" />
  }

  const maxRevenue = Math.max(...data.map(l => l.total_revenue), 1)

  return (
    <ol className={`divide-y divide-white/5 transition-opacity ${embedded ? '' : 'panel overflow-hidden'} ${loading ? 'opacity-60' : ''}`}>
      {data.map((loc, idx) => (
        <li key={loc.location_id} className="list-row items-start !py-2.5">
          <RankBadge rank={idx + 1} />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-3">
              <p className="truncate text-sm font-medium text-white">{loc.location_name}</p>
              <p className="shrink-0 font-mono text-sm font-semibold tabular-nums text-white">{formatCOP(loc.total_revenue)}</p>
            </div>
            <div className="mt-0.5 flex items-center justify-between gap-3 text-2xs text-gray-400">
              <span className="truncate">
                <span className="font-mono tabular-nums">{loc.invoice_count}</span> facturas · Ticket prom. <span className="font-mono tabular-nums">{formatCOP(loc.avg_ticket)}</span>
                {loc.address && <span> · {loc.address}</span>}
              </span>
              <span className="flex shrink-0 gap-2.5 font-mono tabular-nums">
                <span className="flex items-center gap-1" title="Pendientes">
                  <Clock className="h-3 w-3 text-yellow-400" /> {loc.pending_count}
                  <span className="sr-only">pendientes</span>
                </span>
                <span className="flex items-center gap-1" title="Canceladas">
                  <XCircle className="h-3 w-3 text-red-400" /> {loc.cancelled_count}
                  <span className="sr-only">canceladas</span>
                </span>
              </span>
            </div>
            <div className="mt-1.5">
              <ProgressBar pct={(loc.total_revenue / maxRevenue) * 100} height="xs" />
            </div>
          </div>
        </li>
      ))}
    </ol>
  )
}
