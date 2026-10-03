import { Tags } from 'lucide-react'
import { formatCOP } from '../lib/format.js'
import EmptyState from './EmptyState.jsx'
import ProgressBar from './ProgressBar.jsx'

// Máximo de filas; el resto se agrupa en "Otros" para que el panel no crezca
// sin límite con catálogos de muchas categorías.
const MAX_ROWS = 6

/**
 * Ventas por categoría: una fila por categoría con monto y % tabulares a la
 * derecha y una barra proporcional a la categoría que más vendió. Es una
 * lista y no un gráfico: el monto exacto, el % y las unidades se leen sin
 * tooltip y las columnas quedan alineadas con el panel de métodos de pago.
 */
export default function CategoryBreakdown({ data, loading, className = '' }) {
  if (loading && !data?.length) return <div className={`skeleton h-56 rounded-xl ${className}`} />

  const top = (data || []).slice(0, MAX_ROWS)
  const rest = (data || []).slice(MAX_ROWS)
  const restRevenue = rest.reduce((s, d) => s + d.total_revenue, 0)
  const restQty = rest.reduce((s, d) => s + d.total_qty, 0)
  const rows = [
    ...top.map(d => ({ ...d, label: d.category_name || 'Sin categoría' })),
    ...(restRevenue > 0 ? [{ label: `Otros (${rest.length})`, total_revenue: restRevenue, total_qty: restQty, isOther: true }] : []),
  ]
  const total = rows.reduce((s, r) => s + r.total_revenue, 0)
  const max = Math.max(...rows.map(r => r.total_revenue), 1)
  const share = (v) => (total > 0 ? (v / total) * 100 : 0)

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
        <ul className="space-y-2.5 px-4 pb-4 sm:px-5">
          {rows.map(r => (
            <li key={r.label}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="flex min-w-0 items-baseline gap-2">
                  <span className="truncate text-gray-300">{r.label}</span>
                  <span className="shrink-0 font-mono text-2xs tabular-nums text-gray-400">{r.total_qty} uds</span>
                </span>
                <span className="shrink-0 whitespace-nowrap">
                  <span className="font-mono font-semibold tabular-nums text-white">{formatCOP(r.total_revenue)}</span>
                  <span className="ml-2 inline-block w-9 text-right font-mono text-xs tabular-nums text-gray-400">{share(r.total_revenue).toFixed(0)}%</span>
                </span>
              </div>
              <div className="mt-1">
                <ProgressBar pct={(r.total_revenue / max) * 100} height="xs" color={r.isOther ? 'neutral' : 'brand'} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
