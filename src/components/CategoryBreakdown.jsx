import { Tags } from 'lucide-react'
import { formatCOP } from '../lib/format.js'
import EmptyState from './EmptyState.jsx'
import ProgressBar from './ProgressBar.jsx'

// Máximo de filas visibles; el resto se agrupa en "Otros" para que la lista
// no crezca sin límite con catálogos de muchas categorías.
const MAX_ROWS = 7

/**
 * Ventas por categoría como barras horizontales de un solo tono.
 * Antes eran columnas de 8 colores asignados por posición en el ranking: el
 * color de una categoría cambiaba al cambiar el rango de fechas, y el nombre
 * (9px) y el valor (solo en hover) casi no se leían. Aquí la etiqueta
 * identifica la categoría, así que el color queda para la magnitud.
 */
export default function CategoryBreakdown({ data, loading, className = '' }) {
  if (loading) return <div className={`skeleton h-64 rounded-xl ${className}`} />

  const top = (data || []).slice(0, MAX_ROWS)
  const rest = (data || []).slice(MAX_ROWS)
  const restRevenue = rest.reduce((s, d) => s + d.total_revenue, 0)
  const restQty = rest.reduce((s, d) => s + d.total_qty, 0)
  const rows = [
    ...top,
    ...(restRevenue > 0 ? [{ category_name: `Otros (${rest.length})`, total_revenue: restRevenue, total_qty: restQty, isOther: true }] : []),
  ]
  const total = rows.reduce((s, r) => s + r.total_revenue, 0)
  const max = Math.max(...rows.map(r => r.total_revenue), 1)

  return (
    <div className={`panel flex flex-col ${className}`}>
      <div className="panel-header">
        <h3 className="panel-title">Ventas por categoría</h3>
        {rows.length > 0 && <span className="text-xs text-gray-400">{rows.length} categoría{rows.length !== 1 ? 's' : ''}</span>}
      </div>
      {!rows.length ? (
        <div className="px-4 pb-4 sm:px-5 sm:pb-5">
          <EmptyState compact icon={Tags} title="Sin ventas en este período" />
        </div>
      ) : (
        <ul className="space-y-3 px-4 pb-4 sm:px-5 sm:pb-5">
          {rows.map(r => {
            const share = total > 0 ? (r.total_revenue / total) * 100 : 0
            return (
              <li key={r.category_id || r.category_name}>
                <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
                  <span className={`min-w-0 truncate ${r.isOther ? 'italic text-gray-400' : 'text-gray-300'}`} title={r.category_name}>
                    {r.category_name}
                  </span>
                  <span className="shrink-0 whitespace-nowrap text-right">
                    <span className="font-mono font-semibold tabular-nums text-white">{formatCOP(r.total_revenue)}</span>
                    <span className="ml-2 text-xs tabular-nums text-gray-400">{share.toFixed(0)}%</span>
                  </span>
                </div>
                <ProgressBar pct={(r.total_revenue / max) * 100} color={r.isOther ? 'neutral' : 'brand'} />
                <p className="mt-1 text-2xs text-gray-400">{r.total_qty} uds vendidas</p>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
