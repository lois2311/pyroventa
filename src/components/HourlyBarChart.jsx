import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { formatCOP } from '../lib/format.js'
import { MAX_BAR } from '../lib/chartTheme.js'
import { useChartTheme } from '../hooks/useChartTheme.js'
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion.js'
import ChartTooltip from './charts/ChartTooltip.jsx'

const hourNum = (h) => parseInt(String(h).slice(0, 2), 10)
const hourLabel = (h) => `${hourNum(h)}h`
const hourRange = (h) => {
  const n = hourNum(h)
  return `${String(n).padStart(2, '0')}:00 – ${String(n).padStart(2, '0')}:59`
}
const salesLabel = (n) => `${n} venta${n !== 1 ? 's' : ''}`

/**
 * Ventas por hora (detalle de vendedor y de caja). Forma de "énfasis": la
 * hora pico va en el acento y lleva su valor encima; las demás en gris de
 * segundo plano. Monto y rango horario en el tooltip.
 */
export default function HourlyBarChart({ data }) {
  const reducedMotion = usePrefersReducedMotion()
  const { C: CHART, AXIS_TICK } = useChartTheme()
  if (!data?.length) return null

  const peak = data.reduce((a, b) => (b.count > a.count ? b : a), data[0])
  const peakIndex = data.indexOf(peak)

  const renderPeakLabel = ({ x, y, width, index, value }) => (index === peakIndex
    ? (
      <text x={x + width / 2} y={y - 6} textAnchor="middle" fontSize={11} fontWeight={600}
        fill={CHART.label} fontFamily='"JetBrains Mono", Consolas, ui-monospace, monospace'>
        {value}
      </text>
    )
    : null)

  return (
    <figure>
      <figcaption className="sr-only">
        Ventas por hora. Hora pico {hourRange(peak.hour)}: {salesLabel(peak.count)} por {formatCOP(peak.revenue)}.
      </figcaption>
      <div className="h-40">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 20, right: 0, bottom: 0, left: 0 }} barCategoryGap="18%">
            <CartesianGrid vertical={false} stroke={CHART.grid} />
            <XAxis
              dataKey="hour"
              tickFormatter={hourLabel}
              tick={AXIS_TICK}
              tickLine={false}
              axisLine={{ stroke: CHART.grid }}
              interval="preserveStartEnd"
              minTickGap={6}
            />
            <YAxis hide allowDecimals={false} />
            <Tooltip
              cursor={{ fill: 'rgba(255,255,255,0.04)' }}
              content={(
                <ChartTooltip
                  title={(h) => hourRange(h)}
                  valueFormatter={(v) => salesLabel(v)}
                  footer={(d) => formatCOP(d.revenue)}
                />
              )}
            />
            <Bar dataKey="count" name="Ventas" maxBarSize={MAX_BAR} radius={[4, 4, 0, 0]}
              isAnimationActive={!reducedMotion} animationDuration={600}>
              {data.map((h, i) => <Cell key={h.hour} fill={i === peakIndex ? CHART.brand : CHART.muted} />)}
              <LabelList dataKey="count" content={renderPeakLabel} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-2 text-xs text-gray-400">
        Hora pico: <span className="font-medium text-white">{hourRange(peak.hour)}</span>
        {' · '}{salesLabel(peak.count)}{' · '}<span className="font-mono">{formatCOP(peak.revenue)}</span>
      </p>
    </figure>
  )
}
