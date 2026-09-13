import { TrendingDown, TrendingUp } from 'lucide-react'
import { useCountUp } from '../hooks/useCountUp.js'

/**
 * Tile de KPI compartido por los indicadores del dashboard y los modales de
 * detalle (antes MetricCard/KpiCard duplicados). `value` numérico anima con
 * count-up; `format` decide cómo se muestra (formatCOP, entero, etc).
 * `hero` marca el KPI principal de la vista — icono en chip de color con
 * halo sutil (pulse-glow ya definido en tailwind.config.js) y número más grande.
 * `trendPct` (opcional): % vs el período anterior, del campo `previous` que
 * ahora devuelve /reports/daily — null si no hay base de comparación válida.
 */
export default function MetricTile({ icon: Icon, label, value, format = (n) => n, color = 'text-white', sub, hero = false, trendPct = null }) {
  const animated = useCountUp(typeof value === 'number' ? value : 0)
  const display = typeof value === 'number' ? format(animated) : value
  const hasTrend = typeof trendPct === 'number' && isFinite(trendPct)

  return (
    <div className={`card space-y-1.5 ${hero ? 'bg-surface-300 border-brand-500/20' : 'bg-surface-300'}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-gray-400 text-xs">
          {Icon && (
            <span className={`inline-flex items-center justify-center rounded-full shrink-0 ${
              hero ? 'w-7 h-7 bg-brand-500/15 text-brand-400 animate-pulse-glow' : 'w-5 h-5'
            }`}>
              <Icon className="w-3.5 h-3.5" />
            </span>
          )}
          <span>{label}</span>
        </div>
        {hasTrend && (
          <span className={`inline-flex items-center gap-0.5 text-[10px] font-semibold font-mono shrink-0 ${trendPct >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {trendPct >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            {Math.abs(trendPct).toFixed(1)}%
          </span>
        )}
      </div>
      <p className={`font-mono font-bold ${hero ? 'text-3xl' : 'text-2xl'} ${color}`}>{display}</p>
      {sub && <p className="text-xs text-gray-400">{sub}</p>}
    </div>
  )
}
