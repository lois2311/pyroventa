import { useState, useEffect } from 'react'
import { api } from '../lib/api.js'
import { formatCOP, formatDate } from '../lib/format.js'
import { exportToExcel } from '../lib/exportExcel.js'

const STATUS_STYLES = {
  pending:   'badge-pending',
  paid:      'badge-paid',
  cancelled: 'badge-cancelled',
}
const STATUS_LABEL = { pending: 'Pendiente', paid: 'Pagada', cancelled: 'Cancelada' }
const METHOD_LABEL = { cash: 'Efectivo', transfer: 'Transferencia', card: 'Datáfono' }

export default function RegisterDetailModal({ registerId, registerName, from, to, locationId, onClose }) {
  const [data,     setData]     = useState(null)
  const [loading,  setLoading]  = useState(true)
  const [expanded, setExpanded] = useState(null)

  useEffect(() => {
    if (!registerId) return
    setLoading(true)

    const params = new URLSearchParams({ register_id: registerId, from, to })
    if (locationId) params.set('location_id', locationId)

    api.get(`/reports/register-detail?${params.toString()}`)
      .then(d => setData(d))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [registerId, from, to, locationId])

  const handleExport = () => {
    if (!data) return
    exportToExcel([
      { name: 'Resumen', rows: [{ Caja: registerName, Desde: from, Hasta: to,
          Total: data.summary.total_revenue, Facturas: data.summary.invoice_count,
          Efectivo: data.summary.by_pay_method.cash, Transferencia: data.summary.by_pay_method.transfer,
          Tarjeta: data.summary.by_pay_method.card }] },
      { name: 'Productos', rows: (data.top_products || []).map(p => ({ Producto: p.name, Cantidad: p.qty, Total: p.revenue })) },
      { name: 'Facturas', rows: (data.invoices || []).map(i => ({ Código: i.code, Estado: i.status,
          Vendedor: i.seller_name, Método: i.pay_method || '', Total: i.total, Fecha: i.created_at })) },
    ], `caja_${registerName}_${from}_${to}.xlsx`)
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-start justify-center p-3 sm:p-6 overflow-y-auto" onClick={onClose}>
      <div
        className="card bg-surface-200 w-full max-w-2xl my-4 space-y-5 animate-scale-in"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-syne font-bold text-xl text-white">🖥 {registerName}</h2>
            <p className="text-xs text-gray-500">Detalle de caja · {from === to ? from : `${from} → ${to}`}</p>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={handleExport} className="text-gray-500 hover:text-white text-sm px-2" title="Exportar a Excel">⬇</button>
            <button onClick={onClose} className="text-gray-600 hover:text-white text-xl px-2">✕</button>
          </div>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4].map(i => <div key={i} className="skeleton h-16 rounded-xl" />)}
          </div>
        ) : !data ? (
          <p className="text-gray-600 text-sm">Error al cargar datos.</p>
        ) : (
          <>
            {/* KPIs de la caja */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <KpiCard label="Total vendido" value={formatCOP(data.summary.total_revenue)} color="text-brand-400" />
              <KpiCard label="Facturas" value={data.summary.invoice_count} color="text-green-400" />
              <KpiCard label="Ticket promedio" value={formatCOP(data.summary.avg_ticket)} />
              <KpiCard
                label="Pendientes"
                value={data.summary.pending_count}
                color={data.summary.pending_count > 0 ? 'text-yellow-400' : 'text-gray-500'}
              />
            </div>

            {/* Por método de pago */}
            <div className="flex flex-wrap gap-2">
              {data.summary.by_pay_method.cash > 0 && (
                <span className="text-xs px-2 py-1 rounded-lg bg-green-500/20 text-green-400 font-mono">
                  💵 Efectivo: {formatCOP(data.summary.by_pay_method.cash)}
                </span>
              )}
              {data.summary.by_pay_method.transfer > 0 && (
                <span className="text-xs px-2 py-1 rounded-lg bg-blue-500/20 text-blue-400 font-mono">
                  🔁 Transferencia: {formatCOP(data.summary.by_pay_method.transfer)}
                </span>
              )}
              {data.summary.by_pay_method.card > 0 && (
                <span className="text-xs px-2 py-1 rounded-lg bg-violet-500/20 text-violet-400 font-mono">
                  💳 Datáfono: {formatCOP(data.summary.by_pay_method.card)}
                </span>
              )}
            </div>

            {/* Timeline por hora */}
            {data.by_hour?.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-gray-400 mb-2">Ventas por hora</h3>
                <div className="flex gap-1 items-end h-20">
                  {data.by_hour.map(h => {
                    const maxCount = Math.max(...data.by_hour.map(x => x.count), 1)
                    const heightPct = (h.count / maxCount) * 100

                    return (
                      <div key={h.hour} className="flex-1 flex flex-col items-center gap-1" title={`${h.hour}: ${h.count} ventas · ${formatCOP(h.revenue)}`}>
                        <span className="text-[9px] text-gray-500 font-mono">{h.count}</span>
                        <div className="w-full bg-surface-50 rounded-t-sm overflow-hidden" style={{ height: '48px' }}>
                          <div
                            className="w-full bg-brand-500 rounded-t-sm transition-all duration-500"
                            style={{ height: `${heightPct}%`, marginTop: `${100 - heightPct}%` }}
                          />
                        </div>
                        <span className="text-[9px] text-gray-600 font-mono">{h.hour.slice(0, 2)}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Top productos de la caja */}
            {data.top_products?.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-gray-400 mb-2">Productos vendidos</h3>
                <div className="space-y-1">
                  {data.top_products.map((p, i) => (
                    <div key={i} className="flex items-center justify-between text-sm py-1 border-b border-white/5 last:border-0">
                      <span className="text-gray-300">{p.name} <span className="text-gray-600">x{p.qty}</span></span>
                      <span className="font-mono text-brand-400">{formatCOP(p.revenue)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Lista completa de facturas con timestamps */}
            <div>
              <h3 className="text-sm font-semibold text-gray-400 mb-2">
                {data.invoices?.length === 100
                  ? 'Todas las facturas (primeras 100)'
                  : `Todas las facturas (${data.invoices?.length || 0})`}
              </h3>
              <div className="space-y-1.5 max-h-[300px] overflow-y-auto">
                {(data.invoices || []).map(inv => (
                  <div key={inv.id}>
                    <button
                      onClick={() => setExpanded(expanded === inv.id ? null : inv.id)}
                      className="w-full text-left bg-surface-400 hover:bg-surface-300 rounded-lg px-3 py-2 transition-colors"
                    >
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className="font-mono font-bold text-brand-400 text-base">#{inv.code}</span>
                        <span className={STATUS_STYLES[inv.status]}>{STATUS_LABEL[inv.status]}</span>
                        {inv.pay_method && (
                          <span className="text-[10px] text-gray-500">{METHOD_LABEL[inv.pay_method]}</span>
                        )}
                        <span className="flex-1" />
                        <span className="font-mono font-semibold text-white text-sm">{formatCOP(inv.total)}</span>
                        <span className="text-[10px] text-gray-500 font-mono">
                          {new Date(inv.created_at).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </span>
                      </div>
                      {inv.seller_name && (
                        <p className="text-[10px] text-gray-600 mt-0.5">Vendió: {inv.seller_name}</p>
                      )}
                    </button>

                    {expanded === inv.id && (
                      <div className="bg-surface-500 rounded-b-lg px-3 py-2 ml-2 border-l-2 border-brand-500/30 animate-fade-in">
                        {(Array.isArray(inv.items) ? inv.items : []).map((item, idx) => (
                          <div key={idx} className="flex justify-between text-xs py-0.5">
                            <span className="text-gray-400">
                              {item.product_name || item.label}
                              {item.label && item.product_name ? ` · ${item.label}` : ''}
                              <span className="text-gray-600"> x{item.qty}</span>
                            </span>
                            <span className="font-mono text-gray-300">{formatCOP(item.subtotal)}</span>
                          </div>
                        ))}
                        <div className="flex justify-between text-xs pt-1 mt-1 border-t border-white/5 font-semibold">
                          <span className="text-white">Total</span>
                          <span className="font-mono text-brand-400">{formatCOP(inv.total)}</span>
                        </div>
                        {inv.paid_at && (
                          <p className="text-[10px] text-gray-600 mt-1">
                            Cobrada: {formatDate(inv.paid_at)}
                          </p>
                        )}
                        <p className="text-[10px] text-gray-600">
                          Creada: {formatDate(inv.created_at)}
                        </p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function KpiCard({ label, value, color = 'text-white' }) {
  return (
    <div className="bg-surface-400 border border-white/5 rounded-xl p-3">
      <p className="text-[10px] text-gray-600 uppercase tracking-wider">{label}</p>
      <p className={`font-syne font-bold text-lg ${color}`}>{value}</p>
    </div>
  )
}
