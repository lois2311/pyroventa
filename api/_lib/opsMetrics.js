// =====================================================
// Vendra Pedidos — métricas operativas y de salud (puras, sin BD).
// Alimentan el panel de soporte del piloto (plan maestro §7): volumen, tiempos y fallos.
// Solo conteos y promedios: nada de datos personales.
// =====================================================

const MIN = 60_000
const minutesBetween = (a, b) => (new Date(b) - new Date(a)) / MIN
const avg = (xs) => (xs.length ? Math.round((xs.reduce((s, x) => s + x, 0) / xs.length) * 10) / 10 : null)

/** Instante en que se aceptó o rechazó el pedido según su bitácora (history). */
const decidedAt = (order) => (order.history || []).find(h => h.action === 'accept' || h.action === 'reject')?.at

/**
 * @param orders          pedidos creados en la ventana: { status, created_at, history }
 * @param activeOrders    pedidos vigentes ahora: { id, status }
 * @param pendingPayments pagos por transferencia sin resolver: { order_request_id }
 * @param deliveries      entregas de la ventana: { status, assigned_at, delivered_at }
 * @param outbox          filas pending/processing/failed: { status, created_at, next_attempt_at }
 */
export function computeMetrics({ orders = [], activeOrders = [], pendingPayments = [], deliveries = [], conversationsOpen = 0, outbox = [], integrationFailed = 0, messagesFailed = 0, now = new Date() }) {
  const decided = orders.filter(o => decidedAt(o))
  const activeIds = new Set(activeOrders.map(o => o.id))
  const delivered = deliveries.filter(d => d.status === 'delivered' && d.assigned_at && d.delivered_at)
  const pending = outbox.filter(r => r.status === 'pending')
  const oldestPending = pending.reduce((min, r) => (!min || r.created_at < min ? r.created_at : min), null)

  return {
    metrics: {
      orders: {
        created: orders.length,
        accepted: orders.filter(o => o.status === 'accepted').length,
        rejected: orders.filter(o => o.status === 'rejected').length,
        to_review: activeOrders.filter(o => ['submitted', 'under_review'].includes(o.status)).length,
        awaiting_payment_check: pendingPayments.filter(p => activeIds.has(p.order_request_id)).length,
        avg_minutes_to_decision: avg(decided.map(o => minutesBetween(o.created_at, decidedAt(o)))),
      },
      deliveries: {
        assigned: deliveries.length,
        delivered: delivered.length,
        failed: deliveries.filter(d => d.status === 'delivery_failed').length,
        in_progress: deliveries.filter(d => ['assigned', 'picked_up'].includes(d.status)).length,
        avg_minutes_assign_to_delivered: avg(delivered.map(d => minutesBetween(d.assigned_at, d.delivered_at))),
      },
      conversations: { open: conversationsOpen },
    },
    health: {
      outbox: {
        pending: pending.length,
        processing: outbox.filter(r => r.status === 'processing').length,
        failed: outbox.filter(r => r.status === 'failed').length,
        oldest_pending_minutes: oldestPending ? Math.max(0, Math.round(minutesBetween(oldestPending, now))) : 0,
      },
      integration_events_failed: integrationFailed,
      messages_failed: messagesFailed,
    },
  }
}
