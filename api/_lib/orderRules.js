// =====================================================
// Vendra Pedidos — reglas de dominio de la solicitud (puras, sin BD).
// Estado comercial: accepted != ready_for_dispatch. Aceptar NO autoriza despacho
// (la logística llega en PR-07) ni verifica el pago, ni crea factura.
// =====================================================

export const ORDER_STATUSES = ['draft', 'submitted', 'under_review', 'accepted', 'rejected', 'cancelled']
export const PAYMENT_METHODS = ['cash_on_delivery', 'transfer']
export const PAYMENT_STATUSES = ['pending', 'proof_submitted', 'manually_verified', 'rejected']

const TRANSITIONS = {
  draft:        ['submitted', 'cancelled'],
  submitted:    ['under_review', 'accepted', 'rejected', 'cancelled'],
  under_review: ['accepted', 'rejected', 'cancelled'],
  accepted:     ['cancelled'],
  rejected:     [],
  cancelled:    [],
}

export const canTransition = (from, to) => !!TRANSITIONS[from]?.includes(to)

/**
 * ¿Se puede aceptar comercialmente con este pago?
 * cash_on_delivery siempre; transfer solo verificada, salvo accept_policy = allow_pending_transfer
 * (nunca con la evidencia rechazada).
 */
export function evaluateAcceptance(payment, acceptPolicy = 'require_verified') {
  if (!payment) return { ok: false, status: 409, error: 'El pedido no tiene registro de pago' }
  if (payment.method === 'cash_on_delivery') return { ok: true }
  if (payment.status === 'manually_verified') return { ok: true }
  if (payment.status === 'rejected') return { ok: false, status: 409, error: 'La transferencia fue rechazada' }
  if (acceptPolicy === 'allow_pending_transfer') return { ok: true }
  return { ok: false, status: 409, error: 'Verifica la transferencia antes de aceptar el pedido' }
}

/** Transiciones del pago manual: solo transfer, solo desde pending/proof_submitted. */
export function canVerifyPayment(payment, target) {
  if (!['manually_verified', 'rejected'].includes(target)) return { ok: false, status: 422, error: 'Acción de pago inválida' }
  if (payment.method !== 'transfer') return { ok: false, status: 409, error: 'Solo las transferencias se verifican manualmente' }
  if (payment.status === target) return { ok: true, noop: true } // reintento: mismo resultado
  if (!['pending', 'proof_submitted'].includes(payment.status)) return { ok: false, status: 409, error: 'El pago ya fue resuelto' }
  return { ok: true }
}

/**
 * Teléfono colombiano → E.164 (+57XXXXXXXXXX), o null.
 * Acepta móvil de 10 dígitos (3XXXXXXXXX), con 57 o +57; otros países solo con "+" explícito.
 */
export function normalizePhone(raw) {
  if (typeof raw !== 'string') return null
  const digits = raw.replace(/\D/g, '')
  if (/^3\d{9}$/.test(digits)) return `+57${digits}`
  if (/^573\d{9}$/.test(digits)) return `+${digits}`
  if (raw.trim().startsWith('+') && /^[1-9]\d{7,14}$/.test(digits) && !digits.startsWith('57')) return `+${digits}`
  return null
}

export const IDEMPOTENCY_RE = /^[A-Za-z0-9_-]{8,128}$/
export const PUBLIC_TOKEN_RE = /^[a-f0-9]{64}$/

const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
const bad = (error) => ({ status: 422, error })

/** Datos del cliente, entrega y pago del body público. { value } o { status, error }. */
export function parseOrderBody(body = {}, { fulfillment, paymentMethods }) {
  const name = str(body.customer?.name, 80)
  if (name.length < 2) return bad('Escribe tu nombre')
  const phone = normalizePhone(body.customer?.phone)
  if (!phone) return bad('Teléfono inválido')
  if (body.consent !== true) return bad('Debes aceptar el tratamiento de datos para continuar')

  let address = null
  if (fulfillment === 'delivery') {
    const line = str(body.address?.address, 200)
    if (line.length < 5) return bad('Escribe la dirección de entrega')
    address = { address: line, details: str(body.address?.details, 200) || null, reference_notes: str(body.address?.reference_notes, 200) || null }
  }

  const method = body.payment_method
  if (!PAYMENT_METHODS.includes(method) || !paymentMethods.includes(method)) return bad('Método de pago no disponible')

  return { value: { name, phone, address, paymentMethod: method, notes: str(body.notes, 500) || null } }
}

/** Entrada de la bitácora de auditoría (order_requests.history). */
export const historyEntry = (action, { actor, from, to, reason, key } = {}) => ({
  at: new Date().toISOString(),
  action,
  actor: actor ? { id: actor.id, name: actor.name, role: actor.role } : 'customer',
  ...(from && { from }), ...(to && { to }), ...(reason && { reason }), ...(key && { key }),
})

/** Vista pública de un pedido: sin ids internos, tenant, sede ni claves. */
export function publicOrderView(order, payment) {
  const q = order.snapshot?.quote || {}
  return {
    public_token: order.public_token,
    status: order.status,
    currency: q.currency || 'COP',
    items: (q.items || []).map(i => ({ product_name: i.product_name, label: i.label, quantity: i.quantity, unit_price: i.unit_price, subtotal: i.subtotal })),
    subtotal: Number(order.subtotal),
    delivery_fee: Number(order.delivery_fee),
    total: Number(order.total),
    fulfillment: order.fulfillment,
    payment: payment ? { method: payment.method, status: payment.status } : null,
    reject_reason: order.status === 'rejected' ? order.reject_reason : null,
    created_at: order.created_at,
  }
}
