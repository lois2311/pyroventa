import { useId, useMemo, useState } from 'react'
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { formatCOP, formatCOPShort, formatDayShort } from '../lib/format.js'
import { MAX_BAR, PAY_COLORS, PAY_KEYS, PAY_LABELS } from '../lib/chartTheme.js'
import { useChartTheme } from '../hooks/useChartTheme.js'
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion.js'
import ChartTooltip from './charts/ChartTooltip.jsx'

const VIEWS = [
  { id: 'trend',   label: 'Tendencia' },
  { id: 'methods', label: 'Por método' },
]

const CHART_HEIGHT = 232 // incluye la banda del eje X (sin scroll interno)
const MARGIN = { top: 12, right: 8, bottom: 0, left: 0 }

const dayTitle = (day) => formatDayShort(day, { weekday: true })
const invoicesLabel = (n) => `${n} factura${n !== 1 ? 's' : ''}`

/**
 * Segmento de barra apilada: solo el tramo superior no vacío de cada día
 * lleva la punta redondeada (4px); el resto es rectangular. El trazo del
 * color de la superficie deja una separación de 2px entre segmentos.
 */
function StackSegment({ x, y, width, height, fill, isTop, surface }) {
  if (!height || height <= 0 || !width) return null
  const r = isTop ? Math.min(4, width / 2, height) : 0
  const d = r
    ? `M${x},${y + height} V${y + r} Q${x},${y} ${x + r},${y} H${x + width - r} Q${x + width},${y} ${x + width},${y + r} V${y + height} Z`
    : `M${x},${y + height} V${y} H${x + width} V${y + height} Z`
  return <path d={d} fill={fill} stroke={surface} strokeWidth={2} />
}

/**
 * Ventas por día, dos lecturas del mismo rango:
 * - Tendencia: área de un solo tono con curva suave (monotone: no se pasa de
 *   los datos) y línea de promedio diario como referencia.
 * - Por método: barras apiladas efectivo / transferencia / datáfono, en el
 *   orden y los colores fijos de toda la app.
 * La tabla de DailyTrend, debajo, es su vista en tabla (todo valor del
 * tooltip también está ahí).
 */
export default function RevenueTrendChart({ data, loading = false }) {
  const [view, setView] = useState('trend')
  const reducedMotion = usePrefersReducedMotion()
  const { C: CHART, AXIS_TICK } = useChartTheme()
  const gradientId = `rev-${useId().replace(/:/g, '')}`

  const stats = useMemo(() => {
    if (!data?.length) return null
    const total = data.reduce((n, d) => n + Number(d.total_revenue || 0), 0)
    const best = data.reduce((a, b) => (Number(b.total_revenue) > Number(a.total_revenue) ? b : a), data[0])
    // El tramo superior no vacío de cada día (para redondear solo esa punta)
    const topKey = Object.fromEntries(data.map(d => [d.day, [...PAY_KEYS].reverse().find(k => Number(d[k]) > 0)]))
    return { total, avg: total / data.length, best, topKey }
  }, [data])

  if (!data || data.length < 2 || !stats) return null

  const { avg, best, topKey } = stats
  const summary = `Ventas por día del ${dayTitle(data[0].day)} al ${dayTitle(data[data.length - 1].day)}. `
    + `Promedio diario ${formatCOP(avg)}. Mejor día ${dayTitle(best.day)} con ${formatCOP(best.total_revenue)}.`

  // En el área, un margen interno aleja el primer y el último punto de los
  // bordes: la etiqueta del último día no se corta y la curva respira.
  const xAxis = (
    <XAxis
      dataKey="day"
      padding={view === 'trend' ? { left: 16, right: 24 } : undefined}
      tickFormatter={(d) => formatDayShort(d)}
      tick={AXIS_TICK}
      tickLine={false}
      axisLine={{ stroke: CHART.grid }}
      tickMargin={8}
      minTickGap={20}
      interval="preserveStartEnd"
    />
  )
  const yAxis = (
    <YAxis
      tickFormatter={formatCOPShort}
      tick={AXIS_TICK}
      tickLine={false}
      axisLine={false}
      width={56}
      tickCount={5}
      allowDecimals={false}
    />
  )
  const grid = <CartesianGrid vertical={false} stroke={CHART.grid} strokeWidth={1} />

  return (
    <figure className={`panel p-4 transition-opacity sm:p-5 ${loading ? 'opacity-60' : ''}`}>
      <figcaption className="sr-only">{summary}</figcaption>

      {/* Encabezado: cifras de lectura rápida + selector de vista */}
      <div className="mb-4 flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <dl className="flex flex-wrap gap-x-8 gap-y-2">
          <div>
            <dt className="eyebrow">Promedio diario</dt>
            <dd className="mt-0.5 font-mono text-base font-semibold tabular-nums text-white">{formatCOP(avg)}</dd>
          </div>
          <div>
            <dt className="eyebrow">Mejor día</dt>
            <dd className="mt-0.5 text-base font-semibold text-white">
              <span className="font-mono tabular-nums">{formatCOP(best.total_revenue)}</span>
              <span className="ml-2 text-xs font-normal text-gray-400">{dayTitle(best.day)}</span>
            </dd>
          </div>
        </dl>

        <div className="flex flex-wrap items-center gap-3">
          {view === 'methods' && (
            <ul className="flex flex-wrap items-center gap-x-3 gap-y-1" aria-label="Leyenda">
              {PAY_KEYS.map(k => (
                <li key={k} className="flex items-center gap-1.5 text-xs text-gray-300">
                  <span aria-hidden="true" className="h-2.5 w-2.5 rounded-sm" style={{ background: PAY_COLORS[k] }} />
                  {PAY_LABELS[k]}
                </li>
              ))}
            </ul>
          )}
          <div className="segmented" role="group" aria-label="Vista del gráfico">
            {VIEWS.map(v => (
              <button key={v.id} type="button" aria-pressed={view === v.id} onClick={() => setView(v.id)}>
                {v.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div style={{ height: CHART_HEIGHT }} className="-ml-1">
        <ResponsiveContainer width="100%" height="100%">
          {view === 'trend' ? (
            <AreaChart data={data} margin={MARGIN}>
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={CHART.brand} stopOpacity={0.22} />
                  <stop offset="100%" stopColor={CHART.brand} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              {grid}
              {xAxis}
              {yAxis}
              <ReferenceLine
                y={avg}
                stroke={CHART.trend}
                strokeDasharray="4 4"
                strokeWidth={1}
                ifOverflow="extendDomain"
                label={{ value: 'Promedio', position: 'insideTopLeft', fill: CHART.axis, fontSize: 11, dy: -2 }}
              />
              <Tooltip
                cursor={{ stroke: 'rgba(255,255,255,0.18)', strokeWidth: 1 }}
                content={(
                  <ChartTooltip
                    title={(day) => dayTitle(day)}
                    footer={(d) => invoicesLabel(d.invoice_count)}
                  />
                )}
              />
              <Area
                type="monotone"
                dataKey="total_revenue"
                name="Ventas"
                stroke={CHART.brand}
                strokeWidth={2}
                fill={`url(#${gradientId})`}
                dot={(p) => (p.index === data.length - 1
                  ? <circle key="end" cx={p.cx} cy={p.cy} r={4.5} fill={CHART.brand} stroke={CHART.surface} strokeWidth={2} />
                  : <g key={p.index} />)}
                activeDot={{ r: 5, fill: CHART.brand, stroke: CHART.surface, strokeWidth: 2 }}
                isAnimationActive={!reducedMotion}
                animationDuration={700}
              />
            </AreaChart>
          ) : (
            <BarChart data={data} margin={MARGIN} barCategoryGap="28%">
              {grid}
              {xAxis}
              {yAxis}
              <Tooltip
                cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                content={(
                  <ChartTooltip
                    title={(day) => dayTitle(day)}
                    showTotal
                    footer={(d) => invoicesLabel(d.invoice_count)}
                  />
                )}
              />
              {PAY_KEYS.map(k => (
                <Bar
                  key={k}
                  dataKey={k}
                  name={PAY_LABELS[k]}
                  stackId="pay"
                  fill={PAY_COLORS[k]}
                  maxBarSize={MAX_BAR}
                  isAnimationActive={!reducedMotion}
                  animationDuration={600}
                  shape={(p) => <StackSegment {...p} surface={CHART.surface} isTop={topKey[p.payload?.day] === k} />}
                />
              ))}
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
    </figure>
  )
}
