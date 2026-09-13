import { formatCOP } from '../lib/format.js'

/**
 * "Ventas por hora" — antes duplicado en RegisterDetailModal y
 * SellerDetailModal, con el detalle solo en el atributo `title` (sin
 * tooltip visible, invisible en táctil). Ahora cada barra tiene un tooltip
 * real que aparece al hover/focus.
 */
export default function HourlyBarChart({ data }) {
  if (!data?.length) return null
  const maxCount = Math.max(...data.map(h => h.count), 1)

  return (
    <div className="flex gap-1 items-end h-24">
      {data.map(h => {
        const heightPct = (h.count / maxCount) * 100
        return (
          <div key={h.hour} className="group relative flex-1 flex flex-col items-center gap-1">
            <div
              className="absolute bottom-full mb-2 hidden group-hover:flex group-focus-within:flex flex-col items-center
                         bg-surface-100 border border-white/10 rounded-lg px-2 py-1 text-[10px] whitespace-nowrap z-10 shadow-lg"
            >
              <span className="text-white font-semibold">{h.count} venta{h.count !== 1 ? 's' : ''}</span>
              <span className="text-brand-400 font-mono">{formatCOP(h.revenue)}</span>
            </div>
            <span className="text-[9px] text-gray-400 font-mono">{h.count}</span>
            <div
              tabIndex={0}
              className="w-full bg-surface-50 rounded-t-sm overflow-hidden focus:outline-none focus-visible:ring-1 focus-visible:ring-brand-500"
              style={{ height: '48px' }}
            >
              <div
                className="w-full bg-brand-500 rounded-t-sm transition-all duration-500"
                style={{ height: `${heightPct}%`, marginTop: `${100 - heightPct}%` }}
              />
            </div>
            <span className="text-[9px] text-gray-400 font-mono">{h.hour.slice(0, 2)}</span>
          </div>
        )
      })}
    </div>
  )
}
