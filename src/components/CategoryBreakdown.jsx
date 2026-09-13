import { formatCOP } from '../lib/format.js'

// 8 tonos categóricos (columna oscura, dataviz/references/palette.md),
// validados con validate_palette.js contra nuestra superficie real (#111111):
// lightness band, chroma floor, separación CVD y contraste — todo OK en orden fijo.
// Nunca se ciclan ni se generan de más: la 9ª+ categoría se agrupa en "Otros".
const PALETTE = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767']
const OTHER_COLOR = '#5b5b5b'

export default function CategoryBreakdown({ data, loading }) {
  if (loading) return <div className="skeleton h-56 rounded-xl" />
  if (!data?.length) return <p className="text-gray-400 text-sm">Sin ventas registradas para este período.</p>

  const top = data.slice(0, 7)
  const rest = data.slice(7)
  const restRevenue = rest.reduce((s, d) => s + d.total_revenue, 0)
  const restQty = rest.reduce((s, d) => s + d.total_qty, 0)

  const bars = [
    ...top.map((d, i) => ({ ...d, color: PALETTE[i] })),
    ...(restRevenue > 0 ? [{ category_name: 'Otros', total_revenue: restRevenue, total_qty: restQty, color: OTHER_COLOR }] : []),
  ]

  const max = Math.max(...bars.map(b => b.total_revenue), 1)

  return (
    <div className="card bg-surface-300">
      <div className="flex items-end gap-3 h-40">
        {bars.map(b => {
          const pct = (b.total_revenue / max) * 100
          return (
            <div key={b.category_id || b.category_name} className="group relative flex-1 flex flex-col items-center justify-end h-full min-w-0">
              <div className="absolute bottom-full mb-2 hidden group-hover:flex group-focus-within:flex flex-col items-center bg-surface-100 border border-white/10 rounded-lg px-2.5 py-1.5 text-[10px] whitespace-nowrap z-10 shadow-lg">
                <span className="text-white font-semibold">{formatCOP(b.total_revenue)}</span>
                <span className="text-gray-400">{b.total_qty} uds vendidas</span>
              </div>
              <div
                tabIndex={0}
                className="w-full rounded-t-md transition-all duration-500 focus:outline-none focus-visible:ring-1 focus-visible:ring-white/40"
                style={{ height: `${Math.max(pct, 3)}%`, backgroundColor: b.color }}
              />
              <span className="text-[9px] text-gray-400 mt-1.5 text-center truncate w-full" title={b.category_name}>
                {b.category_name}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
