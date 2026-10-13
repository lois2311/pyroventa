import { supabaseAdmin } from '../supabaseAdmin.js'
import { shortCode } from '../deliveryRules.js'

// =====================================================
// Vendra Pedidos — lectura de entregas. Toda consulta lleva tenant_id.
// Nunca expone tenant_id, location_id ni idempotency_key al cliente.
// =====================================================

export const DELIVERY_COLS = 'id, tenant_id, location_id, order_request_id, driver_id, status, instructions, recipient_name, recipient_phone, delivery_address, collect_amount, failure_reason, assigned_at, picked_up_at, delivered_at, created_at, updated_at'

/** id → nombre de los domiciliarios (mismo tenant). */
export async function fetchDriverNames(tenantId, driverIds) {
  const ids = [...new Set(driverIds.filter(Boolean))]
  if (!ids.length) return new Map()
  const { data } = await supabaseAdmin.from('sellers').select('id, name').eq('tenant_id', tenantId).in('id', ids)
  return new Map((data || []).map(s => [s.id, s.name]))
}

export const deliveryView = (d, names = new Map()) => ({
  id: d.id,
  order_request_id: d.order_request_id,
  order_code: shortCode(d.order_request_id),
  status: d.status,
  recipient_name: d.recipient_name,
  recipient_phone: d.recipient_phone,
  delivery_address: d.delivery_address,
  instructions: d.instructions,
  collect_amount: Number(d.collect_amount),
  failure_reason: d.failure_reason,
  driver: d.driver_id ? { id: d.driver_id, name: names.get(d.driver_id) ?? null } : null,
  assigned_at: d.assigned_at,
  picked_up_at: d.picked_up_at,
  delivered_at: d.delivered_at,
  created_at: d.created_at,
  updated_at: d.updated_at,
})

/** Historial de entregas de un pedido, la más reciente primero. */
export async function listOrderDeliveries(tenantId, orderId) {
  const { data } = await supabaseAdmin.from('deliveries').select(DELIVERY_COLS)
    .eq('tenant_id', tenantId).eq('order_request_id', orderId).order('created_at', { ascending: false })
  const rows = data || []
  const names = await fetchDriverNames(tenantId, rows.map(r => r.driver_id))
  return rows.map(d => deliveryView(d, names))
}
