import { Clock, MapPin, XCircle } from 'lucide-react'
import { formatCOP } from '../lib/format.js'
import EmptyState from './EmptyState.jsx'
import ProgressBar from './ProgressBar.jsx'
import RankBadge from './RankBadge.jsx'

export default function LocationComparison({ data, loading }) {
  if (loading && !data?.length) {
    return (
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-3">
        {[1, 2, 3].map(i => <div key={i} className="skeleton h-36 rounded-xl" />)}
      </div>
    )
  }

  if (!data?.length) {
    return <EmptyState compact icon={MapPin} title="Sin datos para mostrar" />
  }

  const maxRevenue = Math.max(...data.map(l => l.total_revenue), 1)

  return (
    <ol className={`grid grid-cols-1 gap-3 transition-opacity md:grid-cols-2 2xl:grid-cols-3 ${loading ? 'opacity-60' : ''}`}>
      {data.map((loc, idx) => (
        <li key={loc.location_id} className="card flex flex-col bg-surface-300">
          <div className="mb-3 flex items-start gap-3">
            <RankBadge rank={idx + 1} />
            <div className="min-w-0 flex-1">
              <h3 className="truncate font-semibold text-white">{loc.location_name}</h3>
              {loc.address && (
                <p className="flex items-center gap-1 truncate text-xs text-gray-400">
                  <MapPin className="h-3 w-3 shrink-0" /> <span className="truncate">{loc.address}</span>
                </p>
              )}
            </div>
            <div className="shrink-0 text-right">
              <p className="font-mono text-lg font-bold tabular-nums text-white">{formatCOP(loc.total_revenue)}</p>
              <p className="text-xs text-gray-400">{loc.invoice_count} facturas</p>
            </div>
          </div>

          <ProgressBar pct={(loc.total_revenue / maxRevenue) * 100} height="md" />

          <div className="mt-auto flex flex-wrap items-center justify-between gap-x-3 gap-y-1 pt-3 text-xs text-gray-400">
            <span>Ticket prom. {formatCOP(loc.avg_ticket)}</span>
            <span className="flex gap-3">
              <span className="flex items-center gap-1" title="Pendientes">
                <Clock className="h-3.5 w-3.5 text-yellow-500" /> {loc.pending_count}
                <span className="sr-only">pendientes</span>
              </span>
              <span className="flex items-center gap-1" title="Canceladas">
                <XCircle className="h-3.5 w-3.5 text-red-500" /> {loc.cancelled_count}
                <span className="sr-only">canceladas</span>
              </span>
            </span>
          </div>
        </li>
      ))}
    </ol>
  )
}
