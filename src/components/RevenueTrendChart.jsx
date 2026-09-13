import { formatCOP } from '../lib/format.js'

// Formato compacto solo para los ticks del eje ($40k, $1.2M) — formatCOP
// completo se reserva para el tooltip, donde sí hay espacio.
function formatShort(n) {
  const v = Number(n) || 0
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(v % 1_000_000 === 0 ? 0 : 1)}M`
  if (v >= 1_000) return `$${Math.round(v / 1000)}k`
  return `$${Math.round(v)}`
}

const W = 600, H = 220
const PAD = { top: 16, right: 12, bottom: 28, left: 46 }
const plotW = W - PAD.left - PAD.right
const plotH = H - PAD.top - PAD.bottom

/**
 * Línea de tendencia de ingresos con área degradada — reemplaza la barra
 * plana que vivía en la última columna de la tabla de DailyTrend. El
 * viewBox fijo + overlay HTML posicionado en % (mismo patrón que
 * HourlyBarChart) da hover y foco por teclado sin rastrear el mouse a mano.
 */
export default function RevenueTrendChart({ data, loading }) {
  if (loading) return <div className="skeleton h-56 rounded-xl" />
  if (!data || data.length < 2) return null

  const max = Math.max(...data.map(d => d.total_revenue), 1) * 1.15
  const n = data.length

  const points = data.map((d, i) => ({
    ...d,
    x: PAD.left + (n === 1 ? plotW / 2 : (i / (n - 1)) * plotW),
    y: PAD.top + plotH - (d.total_revenue / max) * plotH,
  }))

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ')
  const areaPath = `${linePath} L ${points[n - 1].x.toFixed(1)} ${PAD.top + plotH} L ${points[0].x.toFixed(1)} ${PAD.top + plotH} Z`

  const gridSteps = [0.25, 0.5, 0.75, 1]
  const labelEvery = Math.max(1, Math.ceil(n / 6))

  return (
    <div className="card bg-surface-300 animate-fade-in">
      <div className="relative" style={{ height: H }}>
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-full" preserveAspectRatio="none">
          <defs>
            <linearGradient id="revenueArea" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#fb923c" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#fb923c" stopOpacity="0" />
            </linearGradient>
          </defs>

          {gridSteps.map(g => {
            const y = PAD.top + plotH - g * plotH
            return (
              <g key={g}>
                <line x1={PAD.left} x2={W - PAD.right} y1={y} y2={y} stroke="#2a2a2a" strokeWidth="1" vectorEffect="non-scaling-stroke" />
                <text x={PAD.left - 8} y={y + 3} textAnchor="end" fontSize="9" fill="#9ca3af" fontFamily="monospace">
                  {formatShort(g * max)}
                </text>
              </g>
            )
          })}

          <path d={areaPath} fill="url(#revenueArea)" />
          <path d={linePath} fill="none" stroke="#fb923c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />

          {points.map((p, i) => (i % labelEvery === 0 || i === n - 1) && (
            <text key={p.day} x={p.x} y={H - 8} textAnchor="middle" fontSize="9" fill="#9ca3af" fontFamily="monospace">
              {p.day.slice(5).replace('-', '/')}
            </text>
          ))}
        </svg>

        {/* Overlay interactivo: crosshair + punto + tooltip, uno por día */}
        {points.map(p => (
          <button
            key={p.day}
            type="button"
            aria-label={`${p.day}: ${formatCOP(p.total_revenue)}, ${p.invoice_count} factura${p.invoice_count !== 1 ? 's' : ''}`}
            className="group absolute top-0 bottom-0 w-6 -translate-x-1/2 focus:outline-none cursor-default"
            style={{ left: `${(p.x / W) * 100}%` }}
          >
            <span className="absolute inset-y-0 left-1/2 w-px bg-white/10 opacity-0 group-hover:opacity-100 group-focus:opacity-100 transition-opacity" />
            <span
              className="absolute w-2.5 h-2.5 rounded-full bg-brand-400 border-2 border-surface-300 -translate-x-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 group-focus:opacity-100 transition-opacity"
              style={{ left: '50%', top: `${(p.y / H) * 100}%` }}
            />
            <div
              className="absolute hidden group-hover:flex group-focus:flex flex-col items-center bg-surface-100 border border-white/10 rounded-lg px-2.5 py-1.5 text-[10px] whitespace-nowrap z-10 shadow-lg -translate-x-1/2"
              style={{ left: '50%', top: `${Math.max((p.y / H) * 100 - 15, 2)}%` }}
            >
              <span className="text-gray-400 font-mono">{p.day}</span>
              <span className="text-brand-400 font-mono font-semibold">{formatCOP(p.total_revenue)}</span>
              <span className="text-gray-400">{p.invoice_count} factura{p.invoice_count !== 1 ? 's' : ''}</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
