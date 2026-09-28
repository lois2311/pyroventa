import { ArrowRightLeft, Banknote, CheckCircle2, Clock, CreditCard, Wallet } from 'lucide-react'
import { formatCOP } from '../lib/format.js'
import MetricTile from './MetricTile.jsx'
import ProgressBar from './ProgressBar.jsx'
import TransferBreakdown from './TransferBreakdown.jsx'

// Mismos iconos y colores que PaymentMethods.jsx (pantalla de cobro): dos
// lenguajes visuales distintos para cash/transfer/card era la inconsistencia real.
const PAY_METHODS = [
  { key: 'cash',     label: 'Efectivo',      Icon: Banknote,       color: 'green'  },
  { key: 'transfer', label: 'Transferencia', Icon: ArrowRightLeft, color: 'blue'   },
  { key: 'card',     label: 'Datáfono',      Icon: CreditCard,     color: 'violet' },
]

// Marca de color junto al texto: el color identifica el método, el texto
// se queda en tinta neutra (legible sobre la superficie oscura).
const SWATCH = { green: 'text-green-400', blue: 'text-blue-400', violet: 'text-violet-400' }

// % vs el período anterior — null si no hay base real para comparar
// (evita un "+∞%" sin sentido cuando el período previo no tuvo ventas).
const trendPct = (curr, prev) => (prev > 0 ? ((curr - prev) / prev) * 100 : null)

/**
 * KPIs del período. Grilla de 3 columnas con el KPI principal a lo ancho;
 * desde xl, una sola fila de 5 columnas donde el principal ocupa 2.
 * `singleDay` ajusta los textos ("Total del día" / "vs. día anterior").
 */
export function DailyKpis({ data, loading, singleDay = true }) {
  if (loading && !data) {
    return (
      <div className="grid grid-cols-3 gap-3 sm:gap-4 xl:grid-cols-5">
        <div className="skeleton col-span-3 h-32 rounded-xl xl:col-span-2" />
        {[1, 2, 3].map(i => <div key={i} className="skeleton h-32 rounded-xl" />)}
      </div>
    )
  }
  if (!data) return null

  const {
    total_revenue = 0, invoice_count = 0, avg_ticket = 0,
    pending_count = 0, cancelled_count = 0, previous = null,
  } = data
  const trendLabel = singleDay ? 'vs. día anterior' : 'vs. período anterior'

  return (
    <div className={`grid grid-cols-3 gap-3 transition-opacity sm:gap-4 xl:grid-cols-5 ${loading ? 'opacity-60' : ''}`}>
      <MetricTile
        hero
        className="col-span-3 xl:col-span-2"
        icon={Wallet}
        label={singleDay ? 'Total del día' : 'Total del período'}
        value={total_revenue}
        format={formatCOP}
        color="text-brand-400"
        trendPct={previous ? trendPct(total_revenue, previous.total_revenue) : null}
        trendLabel={trendLabel}
      />
      <MetricTile
        icon={CheckCircle2}
        label="Facturas pagadas"
        value={invoice_count}
        format={(n) => Math.round(n)}
        trendPct={previous ? trendPct(invoice_count, previous.invoice_count) : null}
        trendLabel={trendLabel}
      />
      <MetricTile
        icon={CreditCard}
        label="Ticket promedio"
        value={avg_ticket}
        format={formatCOP}
        trendPct={previous ? trendPct(avg_ticket, previous.avg_ticket) : null}
        trendLabel={trendLabel}
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
  )
}

/** Desglose por método de pago, con las transferencias abiertas por billetera. */
export function PaymentBreakdown({ data, loading, className = '' }) {
  if (loading && !data) return <div className={`skeleton h-64 rounded-xl ${className}`} />
  if (!data) return null

  const { total_revenue = 0, by_pay_method = {}, by_transfer_provider = null } = data

  return (
    <div className={`panel ${className}`}>
      <div className="panel-header">
        <h3 className="panel-title">Por método de pago</h3>
        <span className="font-mono text-xs tabular-nums text-gray-400">{formatCOP(total_revenue)}</span>
      </div>
      <ul className="space-y-4 px-4 pb-4 sm:px-5 sm:pb-5">
        {PAY_METHODS.map(m => {
          const val = by_pay_method[m.key] || 0
          const pct = total_revenue > 0 ? (val / total_revenue) * 100 : 0
          return (
            <li key={m.key}>
              <div className="mb-1.5 flex items-baseline justify-between gap-3 text-sm">
                <span className="flex min-w-0 items-center gap-2 text-gray-300">
                  <m.Icon className={`h-4 w-4 shrink-0 ${SWATCH[m.color]}`} /> {m.label}
                </span>
                <span className="shrink-0 whitespace-nowrap">
                  <span className="font-mono font-semibold tabular-nums text-white">{formatCOP(val)}</span>
                  <span className="ml-2 text-xs tabular-nums text-gray-400">{pct.toFixed(0)}%</span>
                </span>
              </div>
              <ProgressBar pct={pct} color={m.color} />
              {/* Las transferencias se abren por billetera/banco */}
              {m.key === 'transfer' && <TransferBreakdown data={by_transfer_provider} />}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/** KPIs + desglose de pago apilados (uso simple, p. ej. fuera del dashboard). */
export default function DailyMetrics({ data, loading, singleDay = true }) {
  return (
    <div className="space-y-6">
      <DailyKpis data={data} loading={loading} singleDay={singleDay} />
      <PaymentBreakdown data={data} loading={loading} />
    </div>
  )
}
