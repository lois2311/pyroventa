import { formatCOP } from '../lib/format.js'

function MetricCard({ label, value, sub, color = 'text-white', icon }) {
  return (
    <div className="card bg-surface-300 space-y-1">
      <div className="flex items-center gap-2 text-gray-500 text-xs">
        {icon && <span>{icon}</span>}
        <span>{label}</span>
      </div>
      <p className={`font-syne font-bold text-2xl ${color}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400">{sub}</p>}
    </div>
  )
}

export default function DailyMetrics({ data, loading }) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
        {[1,2,3,4].map(i => <div key={i} className="skeleton h-24 rounded-xl" />)}
      </div>
    )
  }

  if (!data) return null

  const {
    total_revenue = 0,
    invoice_count = 0,
    avg_ticket    = 0,
    pending_count = 0,
    cancelled_count = 0,
    by_pay_method = {},
  } = data

  const methods = [
    { key: 'cash',     label: 'Efectivo',       emoji: '💵', color: 'text-green-400'  },
    { key: 'transfer', label: 'Transferencia',   emoji: '🔁', color: 'text-blue-400'   },
    { key: 'card',     label: 'Datáfono',        emoji: '💳', color: 'text-violet-400' },
  ]

  const maxMethod = Math.max(...methods.map(m => by_pay_method[m.key] || 0), 1)

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
        <MetricCard
          label="Total del día"
          value={formatCOP(total_revenue)}
          color="text-brand-400"
          icon="💰"
        />
        <MetricCard
          label="Facturas pagadas"
          value={invoice_count}
          color="text-green-400"
          icon="✅"
        />
        <MetricCard
          label="Ticket promedio"
          value={formatCOP(avg_ticket)}
          icon="🎫"
        />
        <MetricCard
          label="Pendientes"
          value={pending_count}
          color={pending_count > 0 ? 'text-yellow-400' : 'text-gray-400'}
          sub={cancelled_count > 0 ? `${cancelled_count} canceladas` : undefined}
          icon="⏳"
        />
      </div>

      {/* Por método de pago */}
      <div className="card bg-surface-300">
        <h3 className="text-sm font-semibold text-gray-400 mb-4">Por método de pago</h3>
        <div className="space-y-3">
          {methods.map(m => {
            const val  = by_pay_method[m.key] || 0
            const pct  = total_revenue > 0 ? (val / total_revenue) * 100 : 0
            return (
              <div key={m.key}>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="flex items-center gap-1.5 text-gray-400">
                    {m.emoji} {m.label}
                  </span>
                  <span className={`font-mono font-semibold ${m.color}`}>{formatCOP(val)}</span>
                </div>
                <div className="h-1.5 bg-surface-50 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      m.key === 'cash'     ? 'bg-green-500'  :
                      m.key === 'transfer' ? 'bg-blue-500'   : 'bg-violet-500'
                    }`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
