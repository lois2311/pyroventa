import { formatCOP, formatDayShort } from '../lib/format.js'
import ProgressBar from './ProgressBar.jsx'

// Tendencia día por día con barra proporcional al mejor día. Es también la
// vista en tabla del gráfico de ventas: todo valor del tooltip está aquí.
// data: [{ day: 'YYYY-MM-DD', total_revenue, invoice_count, cash, transfer, card }]
export default function DailyTrend({ data, loading }) {
  if (loading) {
    return <div className="space-y-2">{[1, 2, 3].map(i => <div key={i} className="skeleton h-10 rounded-xl" />)}</div>
  }
  if (!data || data.length < 2) return null

  const max = Math.max(...data.map(d => d.total_revenue), 1)

  return (
    <div className="panel relative max-h-[360px] overflow-auto">
      <table className="w-full min-w-[600px] text-sm tabular-nums [&_th]:sticky [&_th]:top-0 [&_th]:z-10 [&_th]:border-b [&_th]:border-white/5 [&_th]:bg-surface-300">
        <thead>
          <tr className="text-left text-xs text-gray-400">
            <th scope="col" className="py-2.5 pl-4 pr-3 font-medium sm:pl-5">Día</th>
            <th scope="col" className="py-2.5 pr-3 text-right font-medium">Facturas</th>
            <th scope="col" className="py-2.5 pr-3 text-right font-medium">Efectivo</th>
            <th scope="col" className="py-2.5 pr-3 text-right font-medium">Transf.</th>
            <th scope="col" className="py-2.5 pr-3 text-right font-medium">Datáfono</th>
            <th scope="col" className="py-2.5 pr-3 text-right font-medium">Total</th>
            <th scope="col" className="w-28 py-2.5 pr-4 sm:w-40 sm:pr-5"><span className="sr-only">Proporción</span></th>
          </tr>
        </thead>
        <tbody>
          {data.map(d => (
            <tr key={d.day} className="border-t border-white/5 hover:bg-white/[0.02]">
              <td className="whitespace-nowrap py-2 pl-4 pr-3 font-mono text-gray-300 sm:pl-5">{formatDayShort(d.day, { weekday: true })}</td>
              <td className="py-2 pr-3 text-right font-mono text-gray-400">{d.invoice_count}</td>
              <td className="py-2 pr-3 text-right font-mono text-gray-300">{formatCOP(d.cash)}</td>
              <td className="py-2 pr-3 text-right font-mono text-gray-300">{formatCOP(d.transfer)}</td>
              <td className="py-2 pr-3 text-right font-mono text-gray-300">{formatCOP(d.card)}</td>
              <td className="py-2 pr-3 text-right font-mono font-semibold text-white">{formatCOP(d.total_revenue)}</td>
              <td className="py-2 pr-4 sm:pr-5">
                <ProgressBar pct={(d.total_revenue / max) * 100} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
