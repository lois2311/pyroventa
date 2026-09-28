import { ArrowRightLeft, Banknote, CheckCircle2, Clock, CreditCard, Wallet } from 'lucide-react'
import { useState } from 'react'
import { Cell, Pie, PieChart } from 'recharts'
import { formatCOP } from '../lib/format.js'
import { PAY_COLORS, PAY_KEYS, PAY_LABELS } from '../lib/chartTheme.js'
import { useChartTheme } from '../hooks/useChartTheme.js'
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion.js'
import MetricTile from './MetricTile.jsx'
import TransferBreakdown from './TransferBreakdown.jsx'

// Mismos íconos que PaymentMethods.jsx (pantalla de cobro) y mismos colores
// que el resto de la app (chartTheme.js): un solo lenguaje para cash/transfer/card.
const PAY_ICONS = { cash: Banknote, transfer: ArrowRightLeft, card: CreditCard }

// % vs el período anterior — null si no hay base real para comparar
// (evita un "+∞%" sin sentido cuando el período previo no tuvo ventas).
const trendPct = (curr, prev) => (prev > 0 ? ((curr - prev) / prev) * 100 : null)

/**
 * KPIs del período. Grilla de 3 columnas con el KPI principal a lo ancho;
 * desde xl, una sola fila de 5 columnas donde el principal ocupa 2.
 * `singleDay` ajusta los textos ("Total del día" / "vs. día anterior").
 * Con varios días, cada KPI lleva su sparkline del período (by_day).
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
    pending_count = 0, cancelled_count = 0, previous = null, by_day = [],
  } = data
  const trendLabel = singleDay ? 'vs. día anterior' : 'vs. período anterior'
  const days = by_day.length > 1 ? by_day : null

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
        sparkline={days?.map(d => Number(d.total_revenue) || 0)}
      />
      <MetricTile
        icon={CheckCircle2}
        label="Facturas pagadas"
        value={invoice_count}
        format={(n) => Math.round(n)}
        trendPct={previous ? trendPct(invoice_count, previous.invoice_count) : null}
        trendLabel={trendLabel}
        sparkline={days?.map(d => Number(d.invoice_count) || 0)}
      />
      <MetricTile
        icon={CreditCard}
        label="Ticket promedio"
        value={avg_ticket}
        format={formatCOP}
        trendPct={previous ? trendPct(avg_ticket, previous.avg_ticket) : null}
        trendLabel={trendLabel}
        sparkline={days?.map(d => (Number(d.invoice_count) > 0 ? Number(d.total_revenue) / Number(d.invoice_count) : 0))}
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

const DONUT = 176 // px; el anillo mide 24px (radio 64 → 88)

/**
 * Desglose por método de pago: dona (parte del todo de un vistazo, ≤ 3
 * segmentos) + leyenda con monto y porcentaje de cada método, así ningún
 * valor depende de leer ángulos. Las transferencias se abren por billetera.
 * Al pasar sobre un segmento o su fila de la leyenda, el centro de la dona
 * muestra ese método y el resto se atenúa (en vez de un tooltip que tape el
 * total).
 */
export function PaymentBreakdown({ data, loading, className = '' }) {
  const reducedMotion = usePrefersReducedMotion()
  const { C: CHART } = useChartTheme()
  const [activeKey, setActiveKey] = useState(null)

  if (loading && !data) return <div className={`skeleton h-72 rounded-xl ${className}`} />
  if (!data) return null

  const { total_revenue = 0, by_pay_method = {}, by_transfer_provider = null } = data
  const rows = PAY_KEYS.map(k => ({
    key: k,
    name: PAY_LABELS[k],
    value: Number(by_pay_method[k] || 0),
    fill: PAY_COLORS[k],
  }))
  const segments = rows.filter(r => r.value > 0)
  const share = (v) => (total_revenue > 0 ? (v / total_revenue) * 100 : 0)
  const active = segments.find(r => r.key === activeKey) || null
  const summary = rows.map(r => `${r.name} ${formatCOP(r.value)} (${share(r.value).toFixed(0)}%)`).join(', ')

  return (
    <div className={`panel cq flex flex-col transition-opacity ${loading ? 'opacity-60' : ''} ${className}`}>
      <div className="panel-header">
        <h3 className="panel-title">Por método de pago</h3>
      </div>

      <figure className="cq-row gap-6 px-4 pb-5 sm:px-5">
        <figcaption className="sr-only">Ventas por método de pago: {summary}.</figcaption>

        {/* Dona con el total al centro */}
        <div className="relative shrink-0" style={{ width: DONUT, height: DONUT }}>
          <PieChart width={DONUT} height={DONUT}>
            <Pie
              data={segments.length ? segments : [{ key: 'empty', name: 'Sin ventas', value: 1, fill: CHART.grid }]}
              dataKey="value"
              nameKey="name"
              innerRadius={64}
              outerRadius={88}
              startAngle={90}
              endAngle={-270}
              stroke={CHART.surface}
              strokeWidth={2}
              isAnimationActive={!reducedMotion}
              animationDuration={700}
              onMouseEnter={(_, index) => segments[index] && setActiveKey(segments[index].key)}
              onMouseLeave={() => setActiveKey(null)}
            >
              {(segments.length ? segments : [{ key: 'empty', fill: CHART.grid }]).map(s => (
                <Cell
                  key={s.key}
                  fill={s.fill}
                  fillOpacity={active && active.key !== s.key ? 0.3 : 1}
                  style={{ transition: 'fill-opacity 150ms', outline: 'none' }}
                />
              ))}
            </Pie>
          </PieChart>
          {/* Centro: total, o el método activo con su monto y porcentaje */}
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center" aria-live="polite">
            <span className="eyebrow">{active ? active.name : 'Total'}</span>
            <span className="mt-0.5 font-mono text-base font-bold tabular-nums text-white">
              {formatCOP(active ? active.value : total_revenue)}
            </span>
            {active && <span className="text-2xs tabular-nums text-gray-400">{share(active.value).toFixed(1)}% del total</span>}
          </div>
        </div>

        {/* Leyenda con valores: la lectura exacta no depende de la dona */}
        <ul className="w-full min-w-0 flex-1 space-y-2">
          {rows.map(r => {
            const Icon = PAY_ICONS[r.key]
            return (
              <li
                key={r.key}
                onMouseEnter={() => r.value > 0 && setActiveKey(r.key)}
                onMouseLeave={() => setActiveKey(null)}
                className={`-mx-2 rounded-lg px-2 py-0.5 transition-colors ${activeKey === r.key ? 'bg-white/[0.04]' : ''}`}
              >
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="flex min-w-0 items-center gap-2 text-gray-300">
                    <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: r.fill }} />
                    <Icon className="h-4 w-4 shrink-0 text-gray-400" />
                    <span className="truncate">{r.name}</span>
                  </span>
                  <span className="shrink-0 whitespace-nowrap">
                    <span className="font-mono font-semibold tabular-nums text-white">{formatCOP(r.value)}</span>
                    <span className="ml-2 inline-block w-9 text-right text-xs tabular-nums text-gray-400">{share(r.value).toFixed(0)}%</span>
                  </span>
                </div>
                {r.key === 'transfer' && <TransferBreakdown data={by_transfer_provider} />}
              </li>
            )
          })}
        </ul>
      </figure>
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
