import { formatCOP } from '../lib/format.js'

// Tendencia día por día con barra proporcional al mejor día.
// data: [{ day: 'YYYY-MM-DD', total_revenue, invoice_count, cash, transfer, card }]
export default function DailyTrend({ data, loading }) {
  if (loading) {
    return <div className="space-y-2">{[1, 2, 3].map(i => <div key={i} className="skeleton h-10 rounded-xl" />)}</div>
  }
  if (!data || data.length < 2) return null

  const max = Math.max(...data.map(d => d.total_revenue), 1)

  return (
    <div className="card bg-surface-300 overflow-x-auto">
      <table className="w-full text-sm min-w-[560px]">
        <thead>
          <tr className="text-left text-xs text-gray-400">
            <th className="py-1.5 pr-3 font-medium">Día</th>
            <th className="py-1.5 pr-3 font-medium text-right">Facturas</th>
            <th className="py-1.5 pr-3 font-medium text-right">Efectivo</th>
            <th className="py-1.5 pr-3 font-medium text-right">Transf.</th>
            <th className="py-1.5 pr-3 font-medium text-right">Tarjeta</th>
            <th className="py-1.5 pr-3 font-medium text-right">Total</th>
            <th className="py-1.5 w-32" />
          </tr>
        </thead>
        <tbody>
          {data.map(d => (
            <tr key={d.day} className="border-t border-white/5">
              <td className="py-1.5 pr-3 font-mono text-gray-300">{d.day}</td>
              <td className="py-1.5 pr-3 text-right text-gray-400">{d.invoice_count}</td>
              <td className="py-1.5 pr-3 text-right font-mono text-green-400/80">{formatCOP(d.cash)}</td>
              <td className="py-1.5 pr-3 text-right font-mono text-blue-400/80">{formatCOP(d.transfer)}</td>
              <td className="py-1.5 pr-3 text-right font-mono text-violet-400/80">{formatCOP(d.card)}</td>
              <td className="py-1.5 pr-3 text-right font-mono font-semibold text-brand-400">{formatCOP(d.total_revenue)}</td>
              <td className="py-1.5">
                <div className="h-1.5 bg-surface-50 rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-brand-600 to-brand-400 rounded-full"
                    style={{ width: `${(d.total_revenue / max) * 100}%` }} />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
