import { useState } from 'react'
import { Check, ExternalLink, X } from 'lucide-react'
import { api } from '../../../lib/api.js'
import { formatCOP, formatDate } from '../../../lib/format.js'
import { useApi } from '../../../hooks/useApi.js'
import { ROLE_LABELS } from '../../../../api/_lib/roles.js'
import { evaluateAcceptance } from '../../../../api/_lib/orderRules.js'
import Modal from '../../../components/Modal.jsx'
import ErrorNotice from '../../../components/ErrorNotice.jsx'
import { useConfirm } from '../../../components/ConfirmDialog.jsx'
import { useToast } from '../../../components/Toast.jsx'
import { FormError } from '../shared.jsx'
import { MONO, PAYMENT_METHOD_LABEL, StatusBadge, PaymentBadge, shortId, useActionKeys } from './shared.jsx'

const TIMELINE_LABEL = {
  created: 'Pedido recibido',
  accept: 'Pedido aceptado',
  reject: 'Pedido rechazado',
  payment_verified: 'Transferencia verificada',
  payment_rejected: 'Comprobante rechazado',
}

const OPEN_STATES = ['submitted', 'under_review']
const idemHeaders = (key) => ({ headers: { 'Idempotency-Key': key } })

// ===========================================================
// Detalle de un pedido + acciones del operador.
// Todas las reglas las decide el servidor; aquí solo se anticipan para
// no ofrecer un botón que va a fallar y explicar por qué.
// ===========================================================
export default function PedidoDetalleModal({ orderId, onClose, onChanged }) {
  const q = useApi(`/orders/requests/${orderId}`)
  const o = q.data
  const confirm = useConfirm()
  const toast = useToast()
  const keys = useActionKeys()
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState('')

  const run = async (action, fn, doneMsg) => {
    if (busy) return // evita doble clic
    setBusy(action); setError('')
    try {
      const updated = await fn(keys.get(action))
      keys.done(action)
      q.setData(updated)
      onChanged?.()
      toast.success(doneMsg)
    } catch (err) {
      setError(err.message)
      // 409: otro operador cambió el pedido; se recarga para mostrar el estado real
      if (err.status === 409) { keys.done(action); q.refetch(); onChanged?.() }
    } finally { setBusy(null) }
  }

  const accept = () => run('accept',
    (key) => api.post(`/orders/requests/${orderId}/accept`, {}, idemHeaders(key)), 'Pedido aceptado')

  const reject = async () => {
    const reason = await confirm({
      title: '¿Rechazar este pedido?',
      description: 'El cliente verá el motivo. Un pedido rechazado no se puede reabrir.',
      confirmLabel: 'Rechazar pedido', tone: 'danger',
      input: { label: 'Motivo del rechazo', required: true, requiredMessage: 'Escribe el motivo del rechazo' },
    })
    if (!reason) return
    run('reject', (key) => api.post(`/orders/requests/${orderId}/reject`, { reason }, idemHeaders(key)), 'Pedido rechazado')
  }

  const verifyPayment = async (action) => {
    const verify = action === 'verify'
    const reference = await confirm({
      title: verify ? '¿Verificar esta transferencia?' : '¿Rechazar el comprobante?',
      description: verify
        ? 'Confirma que el dinero ya llegó a la cuenta. Esto no registra un cobro en caja.'
        : 'El pedido no podrá aceptarse con este pago.',
      confirmLabel: verify ? 'Verificar transferencia' : 'Rechazar comprobante',
      tone: verify ? 'default' : 'danger',
      input: { label: 'Referencia de la transferencia (opcional)', required: false },
    })
    if (reference === null || reference === false) return
    run(`pay-${action}`,
      (key) => api.post(`/orders/requests/${orderId}/payment-verifications`, { action, ...(reference && { reference }) }, idemHeaders(key)),
      verify ? 'Transferencia verificada' : 'Comprobante rechazado')
  }

  const open = o && OPEN_STATES.includes(o.status)
  const verdict = o ? evaluateAcceptance(o.payment, o.accept_policy) : null
  const canVerify = o && o.payment?.method === 'transfer'
    && ['pending', 'proof_submitted'].includes(o.payment.status) && o.status !== 'rejected' && o.status !== 'cancelled'

  const footer = o && (open || canVerify) ? (
    <>
      {canVerify && (
        <>
          <button type="button" className="btn-outline" disabled={!!busy} onClick={() => verifyPayment('reject')}>
            <X className="h-4 w-4" aria-hidden="true" /> Rechazar comprobante
          </button>
          <button type="button" className="btn-outline" disabled={!!busy} onClick={() => verifyPayment('verify')}>
            <Check className="h-4 w-4" aria-hidden="true" /> Verificar transferencia
          </button>
        </>
      )}
      {open && (
        <>
          <button type="button" className="btn-danger" disabled={!!busy} onClick={reject}>Rechazar pedido</button>
          <button type="button" className="btn-primary" disabled={!!busy || !verdict.ok} onClick={accept}>Aceptar pedido</button>
        </>
      )}
    </>
  ) : null

  return (
    <Modal
      title={<span className={MONO}>Pedido #{shortId(orderId)}</span>}
      description={o && `Recibido el ${formatDate(o.created_at)}`}
      headerActions={o && <StatusBadge status={o.status} />}
      size="2xl"
      onClose={onClose}
      footer={footer}
    >
      <div className="space-y-4">
        <ErrorNotice error={q.error} title="No se pudo cargar el pedido" onRetry={q.refetch} />
        {q.loading && !o && <div className="skeleton h-48 rounded-lg" role="status" aria-label="Cargando pedido" />}
        {o && (
          <>
            <FormError message={error} />
            {open && !verdict.ok && (
              <p role="status" className="rounded-lg border border-yellow-400/25 bg-yellow-400/10 px-3 py-2 text-sm text-yellow-400">
                {verdict.error}.
              </p>
            )}

            <Section title="Productos">
              <ul className="divide-y divide-white/5">
                {o.items.map(i => (
                  <li key={i.id} className="flex items-baseline gap-3 py-2 text-sm">
                    <span className={`${MONO} w-8 shrink-0 text-gray-400`}>{i.quantity}×</span>
                    <span className="min-w-0 flex-1 text-white">{i.name} <span className="text-gray-400">· {i.label}</span></span>
                    <span className={`${MONO} hidden text-gray-400 sm:inline`}>{formatCOP(i.unit_price)}</span>
                    <span className={`${MONO} w-24 text-right text-white`}>{formatCOP(i.subtotal)}</span>
                  </li>
                ))}
              </ul>
              <dl className="mt-2 space-y-1 border-t border-white/10 pt-2 text-sm">
                <Row label="Subtotal" value={formatCOP(o.subtotal)} />
                <Row label={o.fulfillment === 'pickup' ? 'Recogida en tienda' : 'Domicilio'} value={formatCOP(o.delivery_fee)} />
                <Row label="Total" value={formatCOP(o.total)} strong />
              </dl>
            </Section>

            <div className="grid gap-4 sm:grid-cols-2">
              <Section title="Cliente y entrega">
                <p className="text-sm font-medium text-white">{o.customer?.name}</p>
                <a href={`tel:${o.customer?.phone}`} className={`${MONO} text-sm text-brand-400 hover:underline`}>{o.customer?.phone}</a>
                {o.address ? (
                  <div className="mt-2 text-sm text-gray-300">
                    <p>{o.address.address}</p>
                    {o.address.details && <p className="text-gray-400">{o.address.details}</p>}
                    {o.address.reference_notes && <p className="text-gray-400">Ref.: {o.address.reference_notes}</p>}
                  </div>
                ) : <p className="mt-2 text-sm text-gray-400">Recoge en tienda</p>}
                {o.notes && <p className="mt-2 text-sm text-gray-300"><span className="text-gray-400">Notas: </span>{o.notes}</p>}
              </Section>

              <Section title="Pago">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm text-white">{PAYMENT_METHOD_LABEL[o.payment?.method] || '—'}</span>
                  <PaymentBadge payment={o.payment} />
                </div>
                {o.payment?.reference && <p className="mt-2 text-sm text-gray-300"><span className="text-gray-400">Referencia: </span><span className={MONO}>{o.payment.reference}</span></p>}
                {o.payment?.proof_url && (
                  <a href={o.payment.proof_url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1.5 text-sm text-brand-400 hover:underline">
                    Ver comprobante <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                  </a>
                )}
                {o.status === 'rejected' && o.reject_reason && (
                  <p className="mt-2 text-sm text-red-400"><span className="text-gray-400">Motivo del rechazo: </span>{o.reject_reason}</p>
                )}
                <p className="mt-3 text-xs text-gray-400">Token público <span className={`${MONO} text-gray-300`}>{o.public_token.slice(0, 8)}…{o.public_token.slice(-4)}</span></p>
              </Section>
            </div>

            <Section title="Historial">
              <ol className="space-y-3">
                {o.timeline.map((e, i) => (
                  <li key={`${e.at}-${i}`} className="flex gap-3 text-sm">
                    <span className={`${MONO} w-32 shrink-0 text-xs text-gray-400`}>{formatDate(e.at)}</span>
                    <span className="min-w-0">
                      <span className="text-white">{TIMELINE_LABEL[e.action] || e.action}</span>
                      <span className="text-gray-400"> · {actorLabel(e.actor)}</span>
                      {e.reason && <span className="block text-gray-300">{e.reason}</span>}
                    </span>
                  </li>
                ))}
              </ol>
            </Section>
          </>
        )}
      </div>
    </Modal>
  )
}

function actorLabel(actor) {
  if (actor === 'customer') return 'Cliente'
  if (!actor?.name) return 'Operador'
  return `${actor.name}${actor.role ? ` (${ROLE_LABELS[actor.role] || actor.role})` : ''}`
}

function Section({ title, children }) {
  return (
    <section className="rounded-lg border border-white/5 bg-surface-300 p-4">
      <h3 className="eyebrow mb-2">{title}</h3>
      {children}
    </section>
  )
}

function Row({ label, value, strong = false }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className={strong ? 'font-semibold text-white' : 'text-gray-400'}>{label}</dt>
      <dd className={`${MONO} ${strong ? 'text-base font-semibold text-white' : 'text-gray-300'}`}>{value}</dd>
    </div>
  )
}
