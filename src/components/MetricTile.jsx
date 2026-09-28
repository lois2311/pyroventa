import { TrendingDown, TrendingUp } from 'lucide-react'
import { Line, LineChart, ResponsiveContainer, YAxis } from 'recharts'
import { useCountUp } from '../hooks/useCountUp.js'
import { useChartTheme } from '../hooks/useChartTheme.js'

// Tamaño del valor según el ancho de la propia tarjeta (container query
// units): la misma tarjeta sirve en una grilla de 5 columnas, en un modal o
// a lo ancho de un teléfono sin desbordarse ni verse diminuta.
const VALUE_SIZE = {
  hero:    'clamp(1.875rem, 14cqi, 3.25rem)',
  regular: 'clamp(1rem, 16cqi, 1.75rem)',
}

/**
 * Tile de KPI compartido por los indicadores del dashboard y los modales de
 * detalle (antes MetricCard/KpiCard duplicados). `value` numérico anima con
 * count-up; `format` decide cómo se muestra (formatCOP, entero, etc).
 * `hero` marca el KPI principal de la vista (uno solo por vista): ícono en
 * chip de color y número más grande.
 * `trendPct` (opcional): % vs el período anterior, del campo `previous` que
 * devuelve /reports/daily — null si no hay base de comparación válida.
 * `trendLabel` nombra contra qué se compara ("vs. período anterior").
 * `sparkline` (opcional): serie del período (un valor por día). Se dibuja en
 * gris de segundo plano con el último punto en el acento; es decorativa
 * (aria-hidden) porque la tabla diaria ya tiene esos valores.
 */
export default function MetricTile({
  icon: Icon, label, value, format = (n) => n, color = 'text-white', sub,
  hero = false, trendPct = null, trendLabel = 'vs. período anterior', sparkline = null, className = '',
}) {
  const animated = useCountUp(typeof value === 'number' ? value : 0)
  const display = typeof value === 'number' ? format(animated) : value
  const hasTrend = typeof trendPct === 'number' && isFinite(trendPct)
  const up = hasTrend && trendPct >= 0

  return (
    <div
      className={`card flex flex-col gap-2 bg-surface-300 [container-type:inline-size] ${hero ? 'border-brand-500/25' : ''} ${className}`}
    >
      <div className="flex min-w-0 items-center gap-2 text-xs text-gray-400">
        {Icon && (
          <span className={`inline-flex shrink-0 items-center justify-center rounded-full ${
            hero ? 'h-7 w-7 bg-brand-500/15 text-brand-400' : 'h-5 w-5'
          }`}>
            <Icon className="h-3.5 w-3.5" />
          </span>
        )}
        <span className="min-w-0 leading-tight">{label}</span>
      </div>

      <p
        className={`font-semibold leading-none tracking-tight ${color}`}
        style={{ fontSize: hero ? VALUE_SIZE.hero : VALUE_SIZE.regular }}
      >
        {display}
      </p>

      {(hasTrend || sub) && (
        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-2xs">
          {hasTrend && (
            <span className={`inline-flex items-center gap-0.5 font-semibold tabular-nums ${up ? 'text-green-400' : 'text-red-400'}`}>
              {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
              {up ? '+' : '−'}{Math.abs(trendPct).toFixed(1)}%
              <span className="sr-only">{up ? 'de aumento' : 'de disminución'}</span>
            </span>
          )}
          {hasTrend && <span className="text-gray-400">{trendLabel}</span>}
          {sub && <span className="text-gray-400">{sub}</span>}
        </div>
      )}

      {sparkline?.length > 1 && <Sparkline values={sparkline} tall={hero} />}
    </div>
  )
}

function Sparkline({ values, tall }) {
  const { C: CHART } = useChartTheme()
  const data = values.map((v, i) => ({ i, v }))
  const last = data.length - 1
  return (
    <div className={`-mx-1 mt-auto pt-1 ${tall ? 'h-12' : 'h-9'}`} aria-hidden="true">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 4, right: 5, bottom: 4, left: 5 }} accessibilityLayer={false}>
          <YAxis hide domain={['dataMin', 'dataMax']} />
          <Line
            type="monotone"
            dataKey="v"
            stroke={CHART.trend}
            strokeWidth={1.5}
            dot={(p) => (p.index === last
              ? <circle key="end" cx={p.cx} cy={p.cy} r={3} fill={CHART.brand} stroke={CHART.surface} strokeWidth={1.5} />
              : <g key={p.index} />)}
            activeDot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
