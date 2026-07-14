import { formatCOP } from '../lib/format.js'

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
        const medals = ['🥇', '🥈', '🥉']

        return (
          <div key={loc.location_id} className="card bg-surface-300">
            <div className="flex items-start gap-3 mb-3">
              <span className="text-2xl">{medals[idx] || '📍'}</span>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-white">{loc.location_name}</h3>
                {loc.address && <p className="text-xs text-gray-400 truncate">{loc.address}</p>}
              </div>
              <div className="text-right">
                <p className="font-syne font-bold text-xl text-brand-400">{formatCOP(loc.total_revenue)}</p>
                <p className="text-xs text-gray-400">{loc.invoice_count} facturas</p>
              </div>
            </div>

            {/* Barra de progreso */}
            <div className="h-2 bg-surface-50 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-brand-600 to-brand-400 rounded-full transition-all duration-700"
                style={{ width: `${pct}%` }}
              />
            </div>

            {/* Detalle */}
            <div className="flex justify-between text-xs text-gray-400 mt-2">
              <span>Ticket prom: {formatCOP(loc.avg_ticket)}</span>
              <span className="flex gap-3">
                <span className="text-yellow-600">⏳ {loc.pending_count}</span>
                <span className="text-red-600">✕ {loc.cancelled_count}</span>
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}
