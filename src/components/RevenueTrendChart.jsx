import { formatCOP, formatCOPShort, formatDayShort } from '../lib/format.js'

// Escala "bonita": pasos de 1, 2, 2.5 o 5 × 10^k, así los ticks del eje son
// números redondos ($300k, $600k…) en vez de fracciones del máximo ($321k).
function niceTicks(maxValue, count = 4) {
  const max = Math.max(maxValue, 1)
  const rough = max / count
  const pow = 10 ** Math.floor(Math.log10(rough))
  const step = [1, 2, 2.5, 5, 10].map(m => m * pow).find(s => s >= rough)
  const top = Math.ceil(max / step) * step
  const ticks = []
  for (let v = 0; v <= top + step / 2; v += step) ticks.push(v)
  return { ticks, top }
}

// Coordenadas en un viewBox 0..100 que se estira al contenedor. Solo la
// geometría vive en el SVG; todo el texto (ejes, tooltip) es HTML, porque con
// preserveAspectRatio="none" el texto SVG se deformaba al ensanchar la card.
const VB = 100

/**
 * Tendencia de ingresos por día: línea de 2px sobre un relleno suave.
 * Hover y foco por teclado: cada día es un botón cuya zona de impacto cubre
 * todo su tramo del eje X (no solo el punto), con crosshair, punto y tooltip.
 */
export default function RevenueTrendChart({ data, loading }) {
  if (loading) return <div className="skeleton h-64 rounded-xl" />
  if (!data || data.length < 2) return null

  const n = data.length
  const { ticks, top } = niceTicks(Math.max(...data.map(d => d.total_revenue)))

  const points = data.map((d, i) => ({
    ...d,
    x: (i / (n - 1)) * VB,
    y: VB - (d.total_revenue / top) * VB,
  }))
  const last = points[n - 1]

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' ')
  const areaPath = `${linePath} L ${VB} ${VB} L 0 ${VB} Z`

  // ~7 etiquetas como máximo en el eje X, siempre incluyendo el último día
  const labelEvery = Math.max(1, Math.ceil(n / 7))
  const showLabel = (i) => i === n - 1 || (i % labelEvery === 0 && n - 1 - i >= labelEvery / 2)

  return (
    <div className="panel p-4 sm:p-5 animate-fade-in">
      <div className="flex h-56 sm:h-64">
        {/* Eje Y */}
        <div className="w-12 shrink-0 pb-6 sm:w-14" aria-hidden="true">
          <div className="relative h-full">
            {ticks.map(t => (
              <span
                key={t}
                className="absolute right-2 -translate-y-1/2 font-mono text-2xs tabular-nums text-gray-400"
                style={{ top: `${(1 - t / top) * 100}%` }}
              >
                {formatCOPShort(t)}
              </span>
            ))}
          </div>
        </div>

        {/* Área de trazado + eje X */}
        <div className="relative flex-1 min-w-0 pb-6">
          <div className="relative h-full">
            <svg viewBox={`0 0 ${VB} ${VB}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible" aria-hidden="true">
              <defs>
                <linearGradient id="revenueArea" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#fb923c" stopOpacity="0.16" />
                  <stop offset="100%" stopColor="#fb923c" stopOpacity="0.02" />
                </linearGradient>
              </defs>
              {ticks.map(t => {
                const y = VB - (t / top) * VB
                return <line key={t} x1="0" x2={VB} y1={y} y2={y} stroke="#2a2a2a" strokeWidth="1" vectorEffect="non-scaling-stroke" />
              })}
              <path d={areaPath} fill="url(#revenueArea)" />
              <path d={linePath} fill="none" stroke="#fb923c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
            </svg>

            {/* Punto final fijo: ancla la lectura del último día */}
            <span
              className="pointer-events-none absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface-300 bg-brand-400"
              style={{ left: `${last.x}%`, top: `${last.y}%` }}
              aria-hidden="true"
            />

            {/* Capa interactiva: un tramo por día */}
            {points.map((p, i) => {
              const half = VB / (n - 1) / 2
              const left = Math.max(0, p.x - half)
              const right = Math.min(VB, p.x + half)
              // Tooltip alineado para no salirse por los bordes
              const align = p.x < 15 ? 'left-0' : p.x > 85 ? 'right-0' : 'left-1/2 -translate-x-1/2'
              return (
                <button
                  key={p.day}
                  type="button"
                  aria-label={`${formatDayShort(p.day, { weekday: true })}: ${formatCOP(p.total_revenue)}, ${p.invoice_count} factura${p.invoice_count !== 1 ? 's' : ''}`}
                  className="group absolute inset-y-0 cursor-default focus:outline-none"
                  style={{ left: `${left}%`, width: `${right - left}%` }}
                >
                  {/* Ancla en la X exacta del punto, relativa al tramo */}
                  <span className="absolute inset-y-0" style={{ left: `${((p.x - left) / (right - left)) * 100}%` }}>
                    <span className="absolute inset-y-0 w-px -translate-x-1/2 bg-white/15 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" />
                    <span
                      className="absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface-300 bg-brand-400 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
                      style={{ top: `${p.y}%` }}
                    />
                    <span
                      className={`absolute z-10 hidden min-w-[8.5rem] flex-col rounded-lg border border-white/10 bg-surface-100 px-3 py-2 text-left shadow-lg group-hover:flex group-focus-visible:flex ${align}`}
                      style={{ bottom: `calc(${100 - p.y}% + 12px)` }}
                    >
                      <span className="font-mono text-sm font-semibold tabular-nums text-white">{formatCOP(p.total_revenue)}</span>
                      <span className="text-2xs text-gray-400">
                        {formatDayShort(p.day, { weekday: true })} · {p.invoice_count} factura{p.invoice_count !== 1 ? 's' : ''}
                      </span>
                    </span>
                  </span>
                </button>
              )
            })}
          </div>

          {/* Eje X */}
          <div className="absolute inset-x-0 bottom-0 h-5" aria-hidden="true">
            {points.map((p, i) => showLabel(i) && (
              <span
                key={p.day}
                className={`absolute top-1 whitespace-nowrap text-2xs text-gray-400 ${i === 0 ? '' : i === n - 1 ? '-translate-x-full' : '-translate-x-1/2'}`}
                style={{ left: `${p.x}%` }}
              >
                {formatDayShort(p.day)}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
