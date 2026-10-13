import { describe, it, expect } from 'vitest'
import { computeMetrics } from '../opsMetrics.js'

const NOW = new Date('2026-10-16T12:00:00.000Z')
const at = (min) => new Date(NOW.getTime() - min * 60_000).toISOString()

describe('computeMetrics', () => {
  it('cuenta pedidos, tiempos de decisión, entregas y salud del outbox', () => {
    const { metrics, health } = computeMetrics({
      now: NOW,
      orders: [
        { status: 'accepted', created_at: at(60), history: [{ action: 'created', at: at(60) }, { action: 'accept', at: at(50) }] },
        { status: 'rejected', created_at: at(120), history: [{ action: 'reject', at: at(90) }] },
        { status: 'submitted', created_at: at(5), history: [{ action: 'created', at: at(5) }] },
      ],
      activeOrders: [{ id: 'o1', status: 'submitted' }, { id: 'o2', status: 'accepted' }],
      pendingPayments: [{ order_request_id: 'o1' }, { order_request_id: 'viejo' }],
      deliveries: [
        { status: 'delivered', assigned_at: at(100), delivered_at: at(70) },
        { status: 'delivery_failed', assigned_at: at(80), delivered_at: null },
        { status: 'picked_up', assigned_at: at(10), delivered_at: null },
      ],
      conversationsOpen: 4,
      outbox: [{ status: 'pending', created_at: at(30) }, { status: 'pending', created_at: at(5) }, { status: 'failed', created_at: at(500) }, { status: 'processing', created_at: at(1) }],
      integrationFailed: 2, messagesFailed: 1,
    })
    expect(metrics.orders).toEqual({ created: 3, accepted: 1, rejected: 1, to_review: 1, awaiting_payment_check: 1, avg_minutes_to_decision: 20 })
    expect(metrics.deliveries).toEqual({ assigned: 3, delivered: 1, failed: 1, in_progress: 1, avg_minutes_assign_to_delivered: 30 })
    expect(metrics.conversations.open).toBe(4)
    expect(health).toEqual({ outbox: { pending: 2, processing: 1, failed: 1, oldest_pending_minutes: 30 }, integration_events_failed: 2, messages_failed: 1 })
  })

  it('sin datos devuelve ceros y promedios nulos, sin dividir por cero', () => {
    const { metrics, health } = computeMetrics({ now: NOW })
    expect(metrics.orders.avg_minutes_to_decision).toBeNull()
    expect(metrics.deliveries.avg_minutes_assign_to_delivered).toBeNull()
    expect(health.outbox).toEqual({ pending: 0, processing: 0, failed: 0, oldest_pending_minutes: 0 })
  })
})
