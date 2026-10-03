import { useState } from 'react'
import { ChevronDown, ClipboardList, Pencil, RefreshCw, StickyNote, Tag, Undo2 } from 'lucide-react'
import { api } from '../../lib/api.js'
import { formatCOP, formatDate, formatRangeLabel, payMethodLabel } from '../../lib/format.js'
import { useApi } from '../../hooks/useApi.js'
import PageHeader from '../../components/PageHeader.jsx'
import EmptyState from '../../components/EmptyState.jsx'
import ErrorNotice from '../../components/ErrorNotice.jsx'
import DateRangeBar, { toISO } from '../../components/DateRangeBar.jsx'
import { useConfirm } from '../../components/ConfirmDialog.jsx'
import { useToast } from '../../components/Toast.jsx'
import Select from '../../components/Select.jsx'

// ===========================================================
// TAB: Historial de facturas
// ===========================================================
const STATUS_STYLES = {
  pending:   'badge-pending',
  paid:      'badge-paid',
  cancelled: 'badge-cancelled',
  refunded:  'badge-cancelled',
}
const STATUS_LABEL = { pending: 'Pendiente', paid: 'Pagada', cancelled: 'Cancelada', refunded: 'Devuelta' }

// Columnas de la fila de factura en desktop: todas las filas alinean igual
const INVOICE_ROW_COLS = 'xl:grid xl:grid-cols-[4.5rem_minmax(0,1fr)_6.5rem_9rem_7.5rem_8.5rem_1rem] xl:items-center xl:gap-4'

const STATUS_OPTIONS = [
  { value: '', label: 'Todos' },
  { value: 'paid', label: 'Pagadas' },
  { value: 'pending', label: 'Pendientes' },
  { value: 'cancelled', label: 'Canceladas' },
  { value: 'refunded', label: 'Devueltas' },
]

export default function HistorialTab({ locations }) {
  const { error: toastError, success: toastSuccess } = useToast()
  const confirm = useConfirm()
  const hoy = toISO(new Date())
  const [from, setFrom] = useState(hoy)
  const [to,   setTo]   = useState(hoy)
  const [locFilter,  setLocFilter]  = useState('')
  const [statusFilt, setStatusFilt] = useState('')
  const [expanded,   setExpanded]   = useState(null)

  const params = new URLSearchParams({ from, to })
  if (locFilter)  params.set('location_id', locFilter)
  if (statusFilt) params.set('status', statusFilt)
  params.set('limit', '100')
  // Filtros encadenados (fecha → estado → punto) ya no compiten: cada cambio
  // cancela el pedido anterior y solo se pinta la última respuesta.
  const historyQ = useApi(`/invoices/history?${params.toString()}`)
  const invoices = historyQ.data?.invoices || []
  const total = historyQ.data?.total || 0
  const loading = historyQ.loading

  const handleRefund = async (inv) => {
    const reason = await confirm({
      title: `Devolución de la factura #${inv.code}`,
      description: `Se registra la devolución de ${formatCOP(inv.total)}. La factura queda marcada como devuelta y sale de los totales de venta.`,
      confirmLabel: 'Registrar devolución',
      tone: 'danger',
      input: {
        label: 'Motivo de la devolución',
        required: true,
        requiredMessage: 'Escribe el motivo: queda en el historial de la factura',
        placeholder: 'Ej: producto defectuoso, cobro duplicado…',
        multiline: true,
      },
    })
    if (reason === null) return
    try {
      await api.post(`/invoices/${inv.id}/refund`, { reason })
      toastSuccess(`Devolución de #${inv.code} registrada`)
      historyQ.refetch()
    } catch (err) { toastError(err.message) }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Historial de facturas"
        description={`${formatRangeLabel(from, to)} · ${total} factura${total !== 1 ? 's' : ''}`}
        actions={
          <button type="button" onClick={historyQ.refetch} disabled={loading} className="btn-outline">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Actualizar
          </button>
        }
      />

      <div className="toolbar panel p-3 sm:p-4">
        <DateRangeBar from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t) }} />
        {locations.length > 1 && (
          <div className="w-full sm:w-48">
            <label htmlFor="history-location" className="field-label">Punto de venta</label>
            <Select id="history-location" value={locFilter} onChange={setLocFilter}
              options={[{ value: '', label: 'Todos' }, ...locations.map(l => ({ value: l.id, label: l.name }))]} />
          </div>
        )}
        <div className="w-full sm:w-40">
          <label htmlFor="history-status" className="field-label">Estado</label>
          <Select id="history-status" value={statusFilt} onChange={setStatusFilt} options={STATUS_OPTIONS} />
        </div>
      </div>

      <ErrorNotice error={historyQ.error} title="No se pudo cargar el historial" onRetry={historyQ.refetch} />

      {loading && !invoices.length ? (
        <div className="space-y-2">{[1,2,3,4,5].map(i => <div key={i} className="skeleton h-14 rounded-xl" />)}</div>
      ) : invoices.length === 0 ? (
        !historyQ.error && <EmptyState icon={ClipboardList} title="Sin facturas para los filtros seleccionados" description="Prueba con otro rango de fechas o estado." />
      ) : (
        <div className={`panel overflow-hidden transition-opacity ${loading ? 'opacity-60' : ''}`}>
          {/* Encabezado de columnas (solo pantallas anchas) */}
          <div className={`hidden border-b border-white/5 px-5 py-2.5 text-2xs font-medium uppercase tracking-wider text-gray-400 ${INVOICE_ROW_COLS}`}>
            <span>Código</span>
            <span>Vendedor · punto</span>
            <span>Estado</span>
            <span>Método</span>
            <span className="text-right">Total</span>
            <span className="text-right">Fecha</span>
            <span />
          </div>

          <ul className="divide-y divide-white/5">
            {invoices.map(inv => {
              const open = expanded === inv.id
              return (
                <li key={inv.id}>
                  <button
                    type="button"
                    onClick={() => setExpanded(open ? null : inv.id)}
                    aria-expanded={open}
                    className={`w-full px-4 py-3 text-left transition-colors hover:bg-white/[0.03] sm:px-5 ${open ? 'bg-white/[0.03]' : ''}`}
                  >
                    <div className={`grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 ${INVOICE_ROW_COLS}`}>
                      <span className="font-mono text-base font-bold text-brand-400">#{inv.code}</span>
                      <div className="min-w-0">
                        <p className="truncate text-sm text-white">{inv.seller_name}</p>
                        <p className="truncate text-xs text-gray-400">
                          {inv.location_name}
                          {inv.register_name && <span> · {inv.register_name}</span>}
                          {inv.cashier_name && inv.cashier_name !== inv.seller_name && <span> · Cajero: {inv.cashier_name}</span>}
                        </p>
                      </div>
                      <span className="justify-self-end xl:justify-self-start">
                        <span className={STATUS_STYLES[inv.status]}>{STATUS_LABEL[inv.status]}</span>
                      </span>
                      <span className="col-span-2 truncate text-xs text-gray-400 xl:col-span-1">
                        {inv.pay_method ? payMethodLabel(inv.pay_method, inv.transfer_provider) : '—'}
                      </span>
                      <span className="text-right font-mono text-sm font-semibold tabular-nums text-white">{formatCOP(inv.total)}</span>
                      <span className="col-span-3 text-xs text-gray-400 xl:col-span-1 xl:text-right">
                        {formatDate(inv.created_at)}
                      </span>
                      <ChevronDown className={`hidden h-4 w-4 text-gray-500 transition-transform xl:block ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
                    </div>
                  </button>

                  {/* Detalle expandido */}
                  {open && (
                    <div className="animate-fade-in border-t border-white/5 bg-surface-400/60 px-4 py-4 sm:px-5">
                      <div className="max-w-2xl xl:ml-[5.5rem]">
                        <p className="eyebrow mb-2">Ítems de la factura</p>
                        <div className="space-y-1">
                          {(Array.isArray(inv.items) ? inv.items : []).map((item, idx) => (
                            <div key={idx} className="flex justify-between gap-3 text-sm">
                              <span className="min-w-0 text-gray-300">
                                {item.product_name || item.label}
                                {item.label && item.product_name ? ` (${item.label})` : ''}
                                <span className="text-gray-400"> ×{item.qty}</span>
                              </span>
                              <span className="shrink-0 font-mono tabular-nums text-gray-200">{formatCOP(item.subtotal)}</span>
                            </div>
                          ))}
                        </div>
                        {Number(inv.discount) > 0 && (
                          <div className="mt-2 flex justify-between text-xs">
                            <span className="inline-flex items-center gap-1 text-amber-400"><Tag className="h-3 w-3" /> Descuento</span>
                            <span className="font-mono text-amber-400">−{formatCOP(inv.discount)}</span>
                          </div>
                        )}
                        <div className="mt-3 flex justify-between border-t border-white/5 pt-2">
                          <span className="text-sm font-semibold text-white">Total</span>
                          <span className="font-mono font-bold tabular-nums text-brand-400">{formatCOP(inv.total)}</span>
                        </div>
                        {inv.paid_at && (
                          <p className="mt-2 text-xs text-gray-400">Cobrada: {formatDate(inv.paid_at)}</p>
                        )}
                        {inv.edited_at && (
                          <p className="mt-1 inline-flex items-center gap-1 text-2xs text-yellow-400"><Pencil className="h-3 w-3" /> Editada: {formatDate(inv.edited_at)}</p>
                        )}
                        {inv.status === 'refunded' && (
                          <div className="mt-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2">
                            <p className="inline-flex items-center gap-1 text-2xs text-red-400"><Undo2 className="h-3 w-3" /> Devuelta{inv.refunded_at ? `: ${formatDate(inv.refunded_at)}` : ''}</p>
                            {inv.refund_reason && <p className="text-xs italic text-red-300">“{inv.refund_reason}”</p>}
                          </div>
                        )}
                        {inv.observations && (
                          <div className="mt-2 rounded-lg border border-white/5 bg-surface-300 px-3 py-2">
                            <p className="inline-flex items-center gap-1 text-2xs text-gray-400"><StickyNote className="h-3 w-3" /> Observaciones</p>
                            <p className="text-xs italic text-gray-300">{inv.observations}</p>
                          </div>
                        )}
                        {inv.status === 'paid' && (
                          <div className="mt-3 flex justify-end border-t border-white/5 pt-3">
                            <button type="button" onClick={() => handleRefund(inv)} className="btn-outline btn-sm border-red-500/25 text-red-400 hover:border-red-500/40 hover:text-red-300">
                              <Undo2 className="h-3.5 w-3.5" /> Registrar devolución
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
