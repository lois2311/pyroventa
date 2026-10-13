import { useState } from 'react'
import { RefreshCw, RotateCcw } from 'lucide-react'
import { api } from '../../../lib/api.js'
import { formatDate } from '../../../lib/format.js'
import { useApi } from '../../../hooks/useApi.js'
import ErrorNotice from '../../../components/ErrorNotice.jsx'
import { useToast } from '../../../components/Toast.jsx'
import { MONO, Badge } from './shared.jsx'

const EVENT_LABEL = {
  'message.outbound': 'Respuesta desde la bandeja',
  'order.submitted': 'Aviso: pedido recibido',
  'order.accepted': 'Aviso: pedido aceptado',
  'order.rejected': 'Aviso: pedido rechazado',
  'payment.verified': 'Aviso: transferencia verificada',
  'payment.rejected': 'Aviso: comprobante rechazado',
  'order.delivery_status_changed': 'Aviso: estado del domicilio',
}
const minutes = (m) => (m == null ? '—' : `${m} min`)

// Operación y soporte: números del piloto y notificaciones que no salieron (con reintento).
export default function OperacionSection({ locationId }) {
  const q = useApi(`/orders/ops?location_id=${locationId}`)
  const toast = useToast()
  const [retrying, setRetrying] = useState(null)
  const d = q.data

  const retry = async (id) => {
    if (retrying) return
    setRetrying(id)
    try {
      await api.post(`/orders/ops/outbox/${id}/retry`, {})
      toast.success('Se reintentará en el próximo ciclo del worker')
      q.refetch()
    } catch (err) { toast.error(err.message); if (err.status === 409) q.refetch() }
    finally { setRetrying(null) }
  }

  return (
    <section className="card space-y-4" aria-labelledby="ops-title">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="ops-title" className="panel-title">Operación y soporte <span className="font-normal text-gray-400">· últimos 7 días</span></h2>
        <button type="button" className="btn-ghost btn-sm" onClick={q.refetch} disabled={q.loading}>
          <RefreshCw className={`h-4 w-4 ${q.loading ? 'animate-spin motion-reduce:animate-none' : ''}`} aria-hidden="true" /> Actualizar
        </button>
      </div>
      <ErrorNotice error={q.error} title="No se pudo cargar el estado de la operación" onRetry={q.refetch} />
      {q.loading && !d && <div className="skeleton h-32 rounded-lg" role="status" aria-label="Cargando" />}

      {d && (
        <>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            <Tile label="Pedidos recibidos" value={d.metrics.orders.created} />
            <Tile label="Aceptados / rechazados" value={`${d.metrics.orders.accepted} / ${d.metrics.orders.rejected}`} />
            <Tile label="Por revisar" value={d.metrics.orders.to_review} />
            <Tile label="Transferencias por verificar" value={d.metrics.orders.awaiting_payment_check} />
            <Tile label="Tiempo hasta decidir" value={minutes(d.metrics.orders.avg_minutes_to_decision)} />
            <Tile label="Entregados / fallidos" value={`${d.metrics.deliveries.delivered} / ${d.metrics.deliveries.failed}`} />
            <Tile label="Tiempo asignar → entregar" value={minutes(d.metrics.deliveries.avg_minutes_assign_to_delivered)} />
            <Tile label="Conversaciones abiertas" value={d.metrics.conversations.open} />
          </dl>

          <div>
            <h3 className="eyebrow mb-2">Notificaciones y eventos</h3>
            <ul className="flex flex-wrap gap-2 text-sm text-gray-300">
              <li><Badge tone={d.health.outbox.pending ? 'yellow' : 'gray'}>En cola:{' '}<span className={MONO}>{d.health.outbox.pending}</span></Badge></li>
              <li><Badge tone={d.health.outbox.failed ? 'red' : 'green'}>Fallidas:{' '}<span className={MONO}>{d.health.outbox.failed}</span></Badge></li>
              <li><Badge tone={d.health.outbox.oldest_pending_minutes > 15 ? 'red' : 'gray'}>Más antigua en cola:{' '}<span className={MONO}>{minutes(d.health.outbox.oldest_pending_minutes)}</span></Badge></li>
              <li><Badge tone={d.health.integration_events_failed ? 'red' : 'gray'}>Webhooks fallidos:{' '}<span className={MONO}>{d.health.integration_events_failed}</span></Badge></li>
              <li><Badge tone={d.health.messages_failed ? 'red' : 'gray'}>Mensajes no enviados:{' '}<span className={MONO}>{d.health.messages_failed}</span></Badge></li>
            </ul>
            {d.health.outbox.oldest_pending_minutes > 15 && (
              <p role="status" className="mt-2 text-sm text-yellow-400">Hay notificaciones esperando hace más de 15 minutos: revisa que el worker esté programado (docs/WORKER_OUTBOX.md).</p>
            )}
          </div>

          {d.failed.length > 0 && (
            <div>
              <h3 className="eyebrow mb-2">Notificaciones que no salieron</h3>
              <ul className="divide-y divide-white/5 rounded-lg border border-white/5 bg-surface-300">
                {d.failed.map(f => (
                  <li key={f.id} className="flex flex-wrap items-center gap-3 px-3 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-white">{EVENT_LABEL[f.event_type] || f.event_type}</p>
                      <p className="break-words text-xs text-gray-400">{f.error_details || 'Sin detalle'}</p>
                      <p className={`${MONO} text-xs text-gray-400`}>{f.attempts} intento(s) · {formatDate(f.updated_at)}</p>
                    </div>
                    <button type="button" className="btn-outline" disabled={!!retrying} onClick={() => retry(f.id)}>
                      <RotateCcw className="h-4 w-4" aria-hidden="true" /> Reintentar
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </section>
  )
}

function Tile({ label, value }) {
  return (
    <div className="rounded-lg border border-white/5 bg-surface-400 px-3 py-2">
      <dt className="text-xs text-gray-400">{label}</dt>
      <dd className={`${MONO} text-xl font-semibold text-white`}>{value}</dd>
    </div>
  )
}
