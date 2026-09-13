import { useState, useEffect, useId } from 'react'
import { CheckCircle2, Clock, CreditCard, Download, Monitor, Wallet, X } from 'lucide-react'
import { api } from '../lib/api.js'
import { formatCOP, formatDate, payMethodLabel } from '../lib/format.js'
import HourlyBarChart from './HourlyBarChart.jsx'
import MetricTile from './MetricTile.jsx'
import PaymentMethodChips from './PaymentMethodChips.jsx'
import TransferBreakdown, { transferColumns } from './TransferBreakdown.jsx'
import { exportToExcel } from '../lib/exportExcel.js'
import { useModalA11y } from '../hooks/useModalA11y.js'

const STATUS_STYLES = {
  pending:   'badge-pending',
  paid:      'badge-paid',
  cancelled: 'badge-cancelled',
}
const STATUS_LABEL = { pending: 'Pendiente', paid: 'Pagada', cancelled: 'Cancelada' }

export default function RegisterDetailModal({ registerId, registerName, from, to, locationId, onClose }) {
  const [data,     setData]     = useState(null)
  const [loading,  setLoading]  = useState(true)
  const [expanded, setExpanded] = useState(null)
  const titleId = useId()
  const panelRef = useModalA11y(onClose)

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
          Tarjeta: data.summary.by_pay_method.card,
          ...transferColumns(data.summary.by_transfer_provider) }] },
      { name: 'Productos', rows: (data.top_products || []).map(p => ({ Producto: p.name, Cantidad: p.qty, Total: p.revenue })) },
      { name: 'Facturas', rows: (data.invoices || []).map(i => ({ Código: i.code, Estado: i.status,
          Vendedor: i.seller_name, Método: payMethodLabel(i.pay_method, i.transfer_provider), Total: i.total, Fecha: i.created_at })) },
    ], `caja_${registerName}_${from}_${to}.xlsx`)
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-start justify-center p-3 sm:p-6 overflow-y-auto" onClick={onClose}>
      <div
        ref={panelRef} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}
        className="card bg-surface-200 w-full max-w-2xl my-4 space-y-5 animate-scale-in"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 id={titleId} className="font-syne font-bold text-xl text-white flex items-center gap-2">
              <Monitor className="w-5 h-5 text-gray-400" /> {registerName}
            </h2>
            <p className="text-xs text-gray-400">Detalle de caja · {from === to ? from : `${from} → ${to}`}</p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={handleExport}
              className="btn-touch-safe inline-flex items-center justify-center rounded-lg text-gray-400 hover:text-white hover:bg-surface-50 transition-colors"
              aria-label="Exportar a Excel"
              title="Exportar a Excel"
            >
              <Download className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              className="btn-touch-safe inline-flex items-center justify-center rounded-lg text-gray-400 hover:text-white hover:bg-surface-50 transition-colors"
              aria-label="Cerrar"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4].map(i => <div key={i} className="skeleton h-16 rounded-xl" />)}
          </div>
        ) : !data ? (
          <p className="text-gray-400 text-sm">Error al cargar datos.</p>
        ) : (
          <>
            {/* KPIs de la caja */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <MetricTile icon={Wallet} label="Total vendido" value={data.summary.total_revenue} format={formatCOP} color="text-brand-400" />
              <MetricTile icon={CheckCircle2} label="Facturas" value={data.summary.invoice_count} format={(n) => Math.round(n)} color="text-green-400" />
              <MetricTile icon={CreditCard} label="Ticket promedio" value={data.summary.avg_ticket} format={formatCOP} />
              <MetricTile
                icon={Clock}
                label="Pendientes"
                value={data.summary.pending_count}
                format={(n) => Math.round(n)}
                color={data.summary.pending_count > 0 ? 'text-yellow-400' : 'text-gray-400'}
              />
            </div>

            {/* Por método de pago */}
            <PaymentMethodChips byMethod={data.summary.by_pay_method} size="md" withLabel />

            {/* Desglose de las transferencias por billetera/banco */}
            <TransferBreakdown data={data.summary.by_transfer_provider} compact />

            {/* Timeline por hora */}
            {data.by_hour?.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-gray-400 mb-2">Ventas por hora</h3>
                <HourlyBarChart data={data.by_hour} />
              </div>
            )}

            {/* Top productos de la caja */}
            {data.top_products?.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-gray-400 mb-2">Productos vendidos</h3>
                <div className="space-y-1">
                  {data.top_products.map((p, i) => (
                    <div key={i} className="flex items-center justify-between text-sm py-1 border-b border-white/5 last:border-0">
                      <span className="text-gray-300">{p.name} <span className="text-gray-400">x{p.qty}</span></span>
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
                          <span className="text-[10px] text-gray-400">{payMethodLabel(inv.pay_method, inv.transfer_provider)}</span>
                        )}
                        <span className="flex-1" />
                        <span className="font-mono font-semibold text-white text-sm">{formatCOP(inv.total)}</span>
                        <span className="text-[10px] text-gray-400 font-mono">
                          {new Date(inv.created_at).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </span>
                      </div>
                      {inv.seller_name && (
                        <p className="text-[10px] text-gray-400 mt-0.5">Vendió: {inv.seller_name}</p>
                      )}
                    </button>

                    {expanded === inv.id && (
                      <div className="bg-surface-500 rounded-lg px-3 py-2 mt-1 ml-2 border border-white/5 animate-fade-in">
                        {(Array.isArray(inv.items) ? inv.items : []).map((item, idx) => (
                          <div key={idx} className="flex justify-between text-xs py-0.5">
                            <span className="text-gray-400">
                              {item.product_name || item.label}
                              {item.label && item.product_name ? ` · ${item.label}` : ''}
                              <span className="text-gray-400"> x{item.qty}</span>
                            </span>
                            <span className="font-mono text-gray-300">{formatCOP(item.subtotal)}</span>
                          </div>
                        ))}
                        <div className="flex justify-between text-xs pt-1 mt-1 border-t border-white/5 font-semibold">
                          <span className="text-white">Total</span>
                          <span className="font-mono text-brand-400">{formatCOP(inv.total)}</span>
                        </div>
                        {inv.paid_at && (
                          <p className="text-[10px] text-gray-400 mt-1">
                            Cobrada: {formatDate(inv.paid_at)}
                          </p>
                        )}
                        <p className="text-[10px] text-gray-400">
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
