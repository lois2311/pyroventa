import { Clock, MapPin, XCircle } from 'lucide-react'
import { formatCOP } from '../lib/format.js'
import ProgressBar from './ProgressBar.jsx'
import RankBadge from './RankBadge.jsx'

export default function LocationComparison({ data, loading }) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[1,2,3].map(i => <div key={i} className="skeleton h-40 rounded-xl" />)}
      </div>
    )
  }

  if (!data?.length) {
    return <p className="text-gray-400 text-sm">Sin datos para mostrar.</p>
  }

  const maxRevenue = Math.max(...data.map(l => l.total_revenue), 1)

  return (
    <div className="space-y-3">
      {data.map((loc, idx) => {
        const pct = (loc.total_revenue / maxRevenue) * 100

        return (
          <div key={loc.location_id} className="card bg-surface-300">
            <div className="flex items-start gap-3 mb-3">
              <RankBadge rank={idx + 1} />
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-white">{loc.location_name}</h3>
                {loc.address && (
                  <p className="text-xs text-gray-400 truncate flex items-center gap-1">
                    <MapPin className="w-3 h-3 shrink-0" /> {loc.address}
                  </p>
                )}
              </div>
              <div className="text-right">
                <p className="font-mono font-bold text-xl text-brand-400">{formatCOP(loc.total_revenue)}</p>
                <p className="text-xs text-gray-400">{loc.invoice_count} facturas</p>
              </div>
            </div>

            <ProgressBar pct={pct} height="md" />

            {/* Detalle */}
            <div className="flex justify-between text-xs text-gray-400 mt-2">
              <span>Ticket prom: {formatCOP(loc.avg_ticket)}</span>
              <span className="flex gap-3">
                <span className="flex items-center gap-1 text-yellow-500">
                  <Clock className="w-3 h-3" /> {loc.pending_count}
                </span>
                <span className="flex items-center gap-1 text-red-500">
                  <XCircle className="w-3 h-3" /> {loc.cancelled_count}
                </span>
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}
