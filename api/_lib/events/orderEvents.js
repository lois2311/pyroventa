import { enqueue } from '../services/outboxService.js'

// =====================================================
// Notificaciones de cambios de estado de una solicitud de pedido.
// Cada hecho ocurre una sola vez por pedido (nace, se acepta o rechaza, su pago
// se verifica o rechaza), así que la clave de deduplicación es tipo + pedido:
// reintentar la mutación (misma Idempotency-Key) vuelve a llamar esto sin duplicar,
// y repara el caso en que la mutación se guardó pero el encolado falló.
// El payload no lleva datos personales: el handler los consulta al enviar.
// =====================================================

export const ORDER_EVENTS = {
  submitted:        'order.submitted',
  accepted:         'order.accepted',
  rejected:         'order.rejected',
  paymentVerified:  'payment.verified',
  paymentRejected:  'payment.rejected',
}

export const emitOrderEvent = (order, eventType) => enqueue({
  tenantId: order.tenant_id,
  eventType,
  aggregateType: 'order_request',
  aggregateId: order.id,
  payload: { order_request_id: order.id, location_id: order.location_id },
  dedupeKey: `${eventType}:${order.id}`,
})
