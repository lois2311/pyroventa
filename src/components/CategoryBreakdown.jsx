import { Tags } from 'lucide-react'
import { Bar, BarChart, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { formatCOP, formatCOPShort } from '../lib/format.js'
import { useChartTheme } from '../hooks/useChartTheme.js'
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion.js'
import ChartTooltip from './charts/ChartTooltip.jsx'
import EmptyState from './EmptyState.jsx'

// Máximo de barras visibles; el resto se agrupa en "Otros" para que el
// gráfico no crezca sin límite con catálogos de muchas categorías.
const MAX_ROWS = 7
const ROW_H = 36     // alto mínimo por categoría (barra de 16px + aire)
const ROW_H_MAX = 52 // al estirarse con el panel, cada fila crece hasta aquí

const truncate = (s, n = 18) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)

/**
 * Ventas por categoría: barras horizontales de un solo tono (la etiqueta ya
 * identifica la categoría; el color queda para la magnitud). Valor y % en la
 * punta de cada barra; unidades y monto exacto en el tooltip.
 * Antes eran columnas de 8 colores asignados por posición en el ranking: el
 * color de una categoría cambiaba al cambiar el rango de fechas.
 */
export default function CategoryBreakdown({ data, loading, className = '' }) {
  const reducedMotion = usePrefersReducedMotion()
  const { C: CHART } = useChartTheme()

  if (loading && !data?.length) return <div className={`skeleton h-72 rounded-xl ${className}`} />

  const top = (data || []).slice(0, MAX_ROWS)
  const rest = (data || []).slice(MAX_ROWS)
  const restRevenue = rest.reduce((s, d) => s + d.total_revenue, 0)
  const restQty = rest.reduce((s, d) => s + d.total_qty, 0)
  const rows = [
    ...top.map(d => ({ ...d, label: d.category_name || 'Sin categoría' })),
    ...(restRevenue > 0 ? [{ label: `Otros (${rest.length})`, total_revenue: restRevenue, total_qty: restQty, isOther: true }] : []),
  ]
  const total = rows.reduce((s, r) => s + r.total_revenue, 0)
  const share = (v) => (total > 0 ? (v / total) * 100 : 0)
  const summary = rows.map(r => `${r.label} ${formatCOP(r.total_revenue)}`).join(', ')

  // Valor + % en la punta de cada barra (texto en tinta neutra, no del color de la serie)
  const renderTipLabel = ({ x, y, width, height, index }) => {
    const r = rows[index]
    if (!r) return null
    return (
      <text x={x + width + 8} y={y + height / 2} dy="0.35em" fontSize={11} fontFamily='"JetBrains Mono", Consolas, ui-monospace, monospace'>
        <tspan fill={CHART.label} fontWeight={600}>{formatCOPShort(r.total_revenue)}</tspan>
        <tspan fill={CHART.axis} dx={6}>{share(r.total_revenue).toFixed(0)}%</tspan>
      </text>
    )
  }

  return (
    <div className={`panel flex flex-col transition-opacity ${loading ? 'opacity-60' : ''} ${className}`}>
      <div className="panel-header">
        <h3 className="panel-title">Ventas por categoría</h3>
        {rows.length > 0 && <span className="text-xs text-gray-400">{rows.length} categoría{rows.length !== 1 ? 's' : ''}</span>}
      </div>

      {!rows.length ? (
        <div className="px-4 pb-4 sm:px-5 sm:pb-5">
          <EmptyState compact icon={Tags} title="Sin ventas en este período" />
        </div>
      ) : (
        <figure className="flex flex-1 flex-col px-2 pb-4 sm:px-3 sm:pb-5">
          <figcaption className="sr-only">Ventas por categoría: {summary}.</figcaption>
          {/* Crece con el panel (en la grilla se estira al alto del de pagos) y
              reparte las barras en ese alto, entre un mínimo y un máximo por
              fila: con pocas categorías no quedan barras flotando lejos. */}
          <div className="flex-1" style={{ minHeight: rows.length * ROW_H + 8, maxHeight: rows.length * ROW_H_MAX + 8 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 88, bottom: 4, left: 4 }} barCategoryGap={10}>
                <XAxis type="number" hide domain={[0, 'dataMax']} />
                <YAxis
                  type="category"
                  dataKey="label"
                  width={128}
                  tickFormatter={(s) => truncate(String(s))}
                  tick={{ fill: CHART.labelStrong, fontSize: 12 }}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip
                  cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                  content={(
                    <ChartTooltip
                      title={(label) => label}
                      footer={(d) => `${d.total_qty} uds vendidas · ${share(d.total_revenue).toFixed(1)}% del total`}
                    />
                  )}
                />
                <Bar
                  dataKey="total_revenue"
                  name="Ventas"
                  maxBarSize={16}
                  radius={[0, 4, 4, 0]}
                  isAnimationActive={!reducedMotion}
                  animationDuration={600}
                >
                  {rows.map(r => <Cell key={r.label} fill={r.isOther ? CHART.other : CHART.bar} />)}
                  <LabelList dataKey="total_revenue" content={renderTipLabel} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </figure>
      )}
    </div>
  )
}
