import { useState } from 'react'
import { CheckCircle2, ChevronDown, Clock, CreditCard, Download, Wallet } from 'lucide-react'
import { formatCOP, formatDate, formatRangeLabel, payMethodLabel } from '../lib/format.js'
import { exportToExcel } from '../lib/exportExcel.js'
import { useApi } from '../hooks/useApi.js'
import Modal from './Modal.jsx'
import ErrorNotice from './ErrorNotice.jsx'
import HourlyBarChart from './HourlyBarChart.jsx'
import MetricTile from './MetricTile.jsx'
import PaymentMethodChips from './PaymentMethodChips.jsx'
import TransferBreakdown, { transferColumns } from './TransferBreakdown.jsx'

const STATUS_STYLES = {
  pending:   'badge-pending',
  paid:      'badge-paid',
  cancelled: 'badge-cancelled',
  refunded:  'badge-cancelled',
}
const STATUS_LABEL = { pending: 'Pendiente', paid: 'Pagada', cancelled: 'Cancelada', refunded: 'Devuelta' }

/**
 * Detalle de ventas de un vendedor o de una caja (mismo reporte, distinto
 * filtro). Antes eran dos componentes casi idénticos con su propio overlay
 * y un `.catch(() => {})` que dejaba "Error al cargar datos." sin reintento.
 *
 * - `endpoint` + `params`: el reporte a pedir (/reports/seller-detail…).
 * - `exportName` / `exportSheetKey`: nombre del archivo y columna de la hoja
 *   Resumen ("Vendedor" o "Caja").
 * - `invoiceMeta(inv)`: línea secundaria de cada factura (punto o vendedor).
 * - `invoiceSeller(inv)`: vendedor de la factura para el Excel.
 */
export default function ReportDetailModal({
  title, subtitle, icon, endpoint, params, from, to, onClose,
  exportName, exportSheetKey, invoiceMeta, invoiceSeller,
}) {
  const [expanded, setExpanded] = useState(null)
  const query = new URLSearchParams({ ...params, from, to })
  for (const [k, v] of [...query]) if (!v) query.delete(k)
  const report = useApi(`${endpoint}?${query.toString()}`)
  const data = report.data

  const handleExport = () => {
    if (!data) return
    exportToExcel([
      { name: 'Resumen', rows: [{ [exportSheetKey]: title, Desde: from, Hasta: to,
          Total: data.summary.total_revenue, Facturas: data.summary.invoice_count,
          Efectivo: data.summary.by_pay_method.cash, Transferencia: data.summary.by_pay_method.transfer,
          Tarjeta: data.summary.by_pay_method.card,
          ...transferColumns(data.summary.by_transfer_provider) }] },
      { name: 'Productos', rows: (data.top_products || []).map(p => ({ Producto: p.name, Cantidad: p.qty, Total: p.revenue })) },
      { name: 'Facturas', rows: (data.invoices || []).map(i => ({ Código: i.code, Estado: i.status,
          Vendedor: invoiceSeller(i), Método: payMethodLabel(i.pay_method, i.transfer_provider), Total: i.total, Fecha: i.created_at })) },
    ], `${exportName}_${title}_${from}_${to}.xlsx`)
  }

  const invoices = data?.invoices || []

  return (
    <Modal
      title={title}
      description={`${subtitle} · ${formatRangeLabel(from, to)}`}
      icon={icon}
      iconClassName="text-gray-400"
      size="xl"
      onClose={onClose}
      headerActions={
        <button
          type="button"
          onClick={handleExport}
          disabled={!data}
          className="btn btn-ghost btn-icon text-gray-400"
          aria-label="Exportar a Excel"
          title="Exportar a Excel"
        >
          <Download className="h-4 w-4" />
        </button>
      }
    >
      {report.loading && !data ? (
        <div className="space-y-3" role="status" aria-label="Cargando detalle">
          {[1, 2, 3, 4].map(i => <div key={i} className="skeleton h-16 rounded-xl" />)}
        </div>
      ) : report.error ? (
        <ErrorNotice error={report.error} title="No se pudo cargar el detalle" onRetry={report.refetch} />
      ) : data && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
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

          <PaymentMethodChips byMethod={data.summary.by_pay_method} size="md" withLabel />

          {/* Desglose de las transferencias por billetera/banco */}
          <TransferBreakdown data={data.summary.by_transfer_provider} compact />

          {data.by_hour?.length > 0 && (
            <section>
              <h3 className="mb-2 text-sm font-semibold text-gray-400">Ventas por hora</h3>
              <HourlyBarChart data={data.by_hour} />
            </section>
          )}

          {data.top_products?.length > 0 && (
            <section>
              <h3 className="mb-2 text-sm font-semibold text-gray-400">Productos vendidos</h3>
              <ul className="space-y-1">
                {data.top_products.map((p, i) => (
                  <li key={i} className="flex items-center justify-between gap-3 border-b border-white/5 py-1 text-sm last:border-0">
                    <span className="min-w-0 text-gray-300">{p.name} <span className="text-gray-400">×{p.qty}</span></span>
                    <span className="shrink-0 font-mono tabular-nums text-brand-400">{formatCOP(p.revenue)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section>
            <h3 className="mb-2 text-sm font-semibold text-gray-400">
              {invoices.length === 100 ? 'Todas las facturas (primeras 100)' : `Todas las facturas (${invoices.length})`}
            </h3>
            <ul className="max-h-[300px] space-y-1.5 overflow-y-auto">
              {invoices.map(inv => {
                const open = expanded === inv.id
                const meta = invoiceMeta(inv)
                return (
                  <li key={inv.id}>
                    <button
                      type="button"
                      onClick={() => setExpanded(open ? null : inv.id)}
                      aria-expanded={open}
                      className="w-full rounded-lg bg-surface-400 px-3 py-2 text-left transition-colors hover:bg-surface-300"
                    >
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span className="font-mono text-base font-bold text-brand-400">#{inv.code}</span>
                        <span className={STATUS_STYLES[inv.status]}>{STATUS_LABEL[inv.status]}</span>
                        {inv.pay_method && (
                          <span className="text-2xs text-gray-400">{payMethodLabel(inv.pay_method, inv.transfer_provider)}</span>
                        )}
                        <span className="flex-1" />
                        <span className="font-mono text-sm font-semibold tabular-nums text-white">{formatCOP(inv.total)}</span>
                        <span className="font-mono text-2xs text-gray-400">
                          {new Date(inv.created_at).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </span>
                        <ChevronDown className={`h-3.5 w-3.5 text-gray-500 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
                      </div>
                      {meta && <p className="mt-0.5 flex items-center gap-1 text-2xs text-gray-400">{meta}</p>}
                    </button>

                    {open && (
                      <div className="ml-2 mt-1 animate-fade-in rounded-lg border border-white/5 bg-surface-500 px-3 py-2">
                        {(Array.isArray(inv.items) ? inv.items : []).map((item, idx) => (
                          <div key={idx} className="flex justify-between gap-3 py-0.5 text-xs">
                            <span className="min-w-0 text-gray-400">
                              {item.product_name || item.label}
                              {item.label && item.product_name ? ` · ${item.label}` : ''}
                              <span className="text-gray-400"> ×{item.qty}</span>
                            </span>
                            <span className="shrink-0 font-mono text-gray-300">{formatCOP(item.subtotal)}</span>
                          </div>
                        ))}
                        <div className="mt-1 flex justify-between border-t border-white/5 pt-1 text-xs font-semibold">
                          <span className="text-white">Total</span>
                          <span className="font-mono text-brand-400">{formatCOP(inv.total)}</span>
                        </div>
                        {inv.paid_at && <p className="mt-1 text-2xs text-gray-400">Cobrada: {formatDate(inv.paid_at)}</p>}
                        <p className="text-2xs text-gray-400">Creada: {formatDate(inv.created_at)}</p>
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          </section>
        </>
      )}
    </Modal>
  )
}
