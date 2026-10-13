import { useRef } from 'react'

// Piezas compartidas por las pestañas de Vendra Pedidos.
// Montos, códigos y tokens: siempre font-mono tabular-nums.

export const MONO = 'font-mono tabular-nums'

/** Estado comercial de la solicitud. accepted != listo para despacho (la logística es otra fase). */
export const ORDER_STATUS = {
  submitted:    { label: 'Nuevo',       tone: 'yellow' },
  under_review: { label: 'En revisión', tone: 'blue' },
  accepted:     { label: 'Aceptado',    tone: 'green' },
  rejected:     { label: 'Rechazado',   tone: 'red' },
  cancelled:    { label: 'Cancelado',   tone: 'gray' },
  draft:        { label: 'Borrador',    tone: 'gray' },
}

export const PAYMENT_METHOD_LABEL = { cash_on_delivery: 'Contraentrega', transfer: 'Transferencia' }

const PAYMENT_STATUS = {
  pending:           { label: 'Pendiente',          tone: 'yellow' },
  proof_submitted:   { label: 'Comprobante enviado', tone: 'blue' },
  manually_verified: { label: 'Verificado',          tone: 'green' },
  rejected:          { label: 'Rechazado',           tone: 'red' },
}

const TONES = {
  yellow: 'bg-yellow-400/15 text-yellow-400',
  blue:   'bg-blue-400/15 text-blue-400',
  green:  'bg-green-400/15 text-green-400',
  red:    'bg-red-400/15 text-red-400',
  gray:   'bg-white/10 text-gray-300',
}

export function Badge({ tone = 'gray', children }) {
  return <span className={`inline-flex items-center whitespace-nowrap rounded-lg px-2 py-0.5 text-xs font-medium ${TONES[tone]}`}>{children}</span>
}

export const StatusBadge = ({ status }) => {
  const s = ORDER_STATUS[status] || { label: status, tone: 'gray' }
  return <Badge tone={s.tone}>{s.label}</Badge>
}

/** Un pago en contraentrega no se verifica: su estado "pendiente" es normal, no una alerta. */
export function PaymentBadge({ payment }) {
  if (!payment) return <Badge>Sin pago</Badge>
  if (payment.method === 'cash_on_delivery') return <Badge>Contraentrega</Badge>
  const s = PAYMENT_STATUS[payment.status] || { label: payment.status, tone: 'gray' }
  return <Badge tone={s.tone}>Transferencia · {s.label.toLowerCase()}</Badge>
}

/** ¿Falta verificar esta transferencia? */
export const needsPaymentCheck = (order) =>
  order.payment?.method === 'transfer'
  && ['pending', 'proof_submitted'].includes(order.payment.status)
  && ['submitted', 'under_review', 'accepted'].includes(order.status)

export const shortId = (id) => String(id || '').slice(0, 8).toUpperCase()

/** Día calendario en Bogotá (YYYY-MM-DD), el mismo corte que usan los reportes. */
export const bogotaDay = (iso) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })

/**
 * Una Idempotency-Key por acción, estable mientras la acción no termine bien:
 * si la respuesta se pierde y el operador reintenta, el servidor reconoce la
 * misma operación en vez de rechazarla como transición inválida.
 */
export function useActionKeys() {
  const keys = useRef({})
  return {
    get: (action) => (keys.current[action] ||= crypto.randomUUID()),
    done: (action) => { delete keys.current[action] },
  }
}
