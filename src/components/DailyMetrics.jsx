import { ArrowRightLeft, Banknote, CheckCircle2, Clock, CreditCard, Wallet } from 'lucide-react'
import { formatCOP } from '../lib/format.js'
import MetricTile from './MetricTile.jsx'
import ProgressBar from './ProgressBar.jsx'
import TransferBreakdown from './TransferBreakdown.jsx'

// Mismos iconos y colores que PaymentMethods.jsx (pantalla de cobro): dos
// lenguajes visuales distintos para cash/transfer/card era la inconsistencia real.
const PAY_METHODS = [
  { key: 'cash',     label: 'Efectivo',      Icon: Banknote,       color: 'green',  text: 'text-green-400'  },
  { key: 'transfer', label: 'Transferencia', Icon: ArrowRightLeft, color: 'blue',   text: 'text-blue-400'   },
  { key: 'card',     label: 'Datáfono',      Icon: CreditCard,     color: 'violet', text: 'text-violet-400' },
]

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
    by_transfer_provider = null,
    previous = null,
  } = data

  // % vs el período anterior — null si no hay base real para comparar
  // (evita un "+∞%" sin sentido cuando el período previo no tuvo ventas).
  const trendPct = (curr, prev) => (prev > 0 ? ((curr - prev) / prev) * 100 : null)

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
        <MetricTile
          hero
          icon={Wallet}
          label="Total del día"
          value={total_revenue}
          format={formatCOP}
          color="text-brand-400"
          trendPct={previous ? trendPct(total_revenue, previous.total_revenue) : null}
        />
        <MetricTile
          icon={CheckCircle2}
          label="Facturas pagadas"
          value={invoice_count}
          format={(n) => Math.round(n)}
          color="text-green-400"
          trendPct={previous ? trendPct(invoice_count, previous.invoice_count) : null}
        />
        <MetricTile
          icon={CreditCard}
          label="Ticket promedio"
          value={avg_ticket}
          format={formatCOP}
          trendPct={previous ? trendPct(avg_ticket, previous.avg_ticket) : null}
        />
        <MetricTile
          icon={Clock}
          label="Pendientes"
          value={pending_count}
          format={(n) => Math.round(n)}
          color={pending_count > 0 ? 'text-yellow-400' : 'text-gray-400'}
          sub={cancelled_count > 0 ? `${cancelled_count} canceladas` : undefined}
        />
      </div>

      {/* Por método de pago */}
      <div className="card bg-surface-300">
        <h3 className="text-sm font-semibold text-gray-400 mb-4">Por método de pago</h3>
        <div className="space-y-3">
          {PAY_METHODS.map(m => {
            const val  = by_pay_method[m.key] || 0
            const pct  = total_revenue > 0 ? (val / total_revenue) * 100 : 0
            return (
              <div key={m.key}>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="flex items-center gap-1.5 text-gray-400">
                    <m.Icon className="w-3.5 h-3.5" /> {m.label}
                  </span>
                  <span className={`font-mono font-semibold ${m.text}`}>{formatCOP(val)}</span>
                </div>
                <ProgressBar pct={pct} color={m.color} />
                {/* Las transferencias se abren por billetera/banco */}
                {m.key === 'transfer' && <TransferBreakdown data={by_transfer_provider} />}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
