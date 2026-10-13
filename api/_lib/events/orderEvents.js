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
  deliveryStatusChanged: 'order.delivery_status_changed',
}

export const emitOrderEvent = (order, eventType) => enqueue({
  tenantId: order.tenant_id,
  eventType,
  aggregateType: 'order_request',
  aggregateId: order.id,
  payload: { order_request_id: order.id, location_id: order.location_id },
  dedupeKey: `${eventType}:${order.id}`,
})

/** Estados de la entrega que se avisan al cliente (asignar un domiciliario es interno). */
export const CUSTOMER_DELIVERY_STATUSES = ['picked_up', 'delivered', 'delivery_failed']

/**
 * Aviso de un cambio de estado de la entrega. Agregado = el pedido (el handler resuelve cliente y canal).
 * Idempotente por entrega + estado: repetir el cambio (o el reintento del conductor) no duplica el aviso.
 */
export const emitDeliveryEvent = (delivery, status) => enqueue({
  tenantId: delivery.tenant_id,
  eventType: ORDER_EVENTS.deliveryStatusChanged,
  aggregateType: 'order_request',
  aggregateId: delivery.order_request_id,
  payload: { delivery_id: delivery.id, status },
  dedupeKey: `${ORDER_EVENTS.deliveryStatusChanged}:${delivery.id}:${status}`,
})
