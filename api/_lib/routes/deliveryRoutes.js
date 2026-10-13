import { supabaseAdmin } from '../supabaseAdmin.js'
import { requireCan } from '../auth.js'
import { can } from '../roles.js'
import { scopedLocation, denyOutOfScope } from '../scopedLocation.js'
import { locationInScope } from '../scope.js'
import { emitDeliveryEvent, CUSTOMER_DELIVERY_STATUSES } from '../events/orderEvents.js'
import {
  DELIVERY_STATUSES, ACTIVE_STATUSES, FINISHED_STATUSES, SETTABLE_STATUSES,
  canDeliveryTransition, addressLine, amountToCollect, bogotaDayStart,
} from '../deliveryRules.js'
import { DELIVERY_COLS, deliveryView, fetchDriverNames } from '../services/deliveryService.js'
import { idemKey } from './orderRequestRoutes.js'

// =====================================================
// Vendra Pedidos — entregas (PR-07).
//   - Crear la entrega (asignar domiciliario) a un pedido `accepted` = autorización de despacho.
//   - El domiciliario (rol driver) solo ve y cambia SUS entregas; las ajenas responden 404.
//   - Nada aquí toca facturas, caja ni inventario.
// Toda consulta lleva tenant_id.
// =====================================================

const UNIQUE_VIOLATION = '23505'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_LIST = 100

const findByKey = async (tenantId, key) => {
  const { data } = await supabaseAdmin.from('deliveries').select(DELIVERY_COLS)
    .eq('tenant_id', tenantId).eq('idempotency_key', key).maybeSingle()
  return data || null
}

// GET /orders/drivers?location_id=  — domiciliarios activos del punto (para asignar)
export async function driversList(req, res) {
  const auth = await requireCan(req, res, 'manage_deliveries'); if (!auth) return
  const locationId = scopedLocation(auth, req.query?.location_id, res)
  if (!locationId) return
  const [{ data: drivers }, { data: links }] = await Promise.all([
    supabaseAdmin.from('sellers').select('id, name').eq('tenant_id', auth.tenantId).eq('role', 'driver').eq('active', true),
    supabaseAdmin.from('seller_locations').select('seller_id').eq('tenant_id', auth.tenantId).eq('location_id', locationId),
  ])
  const here = new Set((links || []).map(l => l.seller_id))
  return res.json((drivers || []).filter(d => here.has(d.id)).map(d => ({ id: d.id, name: d.name })).sort((a, b) => a.name.localeCompare(b.name, 'es')))
}

// POST /orders/requests/:id/deliveries  { driver_id, instructions? }
export async function deliveryCreate(req, res, orderId) {
  const auth = await requireCan(req, res, 'manage_deliveries'); if (!auth) return
  const key = idemKey(req, res); if (!key) return
  if (!UUID_RE.test(String(orderId))) return res.status(404).json({ error: 'Pedido no encontrado' })

  const { data: order } = await supabaseAdmin.from('order_requests').select('*')
    .eq('id', orderId).eq('tenant_id', auth.tenantId).maybeSingle()
  if (!order) return res.status(404).json({ error: 'Pedido no encontrado' })
  if (denyOutOfScope(auth, order.location_id, res)) return

  // Reintento con la misma clave: la misma entrega, sin crear otra
  const prior = await findByKey(auth.tenantId, key)
  if (prior) {
    if (prior.order_request_id !== order.id) return res.status(409).json({ error: 'Idempotency-Key ya usada en otro pedido' })
    return res.status(200).json(deliveryView(prior, await fetchDriverNames(auth.tenantId, [prior.driver_id])))
  }

  if (order.status !== 'accepted') return res.status(409).json({ error: 'Solo se despachan pedidos aceptados' })
  if (order.fulfillment !== 'delivery') return res.status(409).json({ error: 'El pedido es para recoger en tienda, no tiene domicilio' })

  const driverId = req.body?.driver_id
  if (!UUID_RE.test(String(driverId))) return res.status(422).json({ error: 'Elige un domiciliario' })
  const [{ data: driver }, { data: link }] = await Promise.all([
    supabaseAdmin.from('sellers').select('id, name').eq('tenant_id', auth.tenantId).eq('id', driverId).eq('role', 'driver').eq('active', true).maybeSingle(),
    supabaseAdmin.from('seller_locations').select('seller_id').eq('tenant_id', auth.tenantId).eq('seller_id', driverId).eq('location_id', order.location_id).maybeSingle(),
  ])
  if (!driver || !link) return res.status(422).json({ error: 'El domiciliario no está disponible en este punto' })

  const { data: payment } = await supabaseAdmin.from('payment_records').select('method, status')
    .eq('tenant_id', auth.tenantId).eq('order_request_id', order.id).maybeSingle()
  const snap = order.snapshot || {}
  const now = new Date().toISOString()
  const ins = await supabaseAdmin.from('deliveries').insert({
    tenant_id: auth.tenantId, location_id: order.location_id, order_request_id: order.id, driver_id: driver.id,
    status: 'assigned', assigned_at: now,
    instructions: typeof req.body?.instructions === 'string' ? req.body.instructions.trim().slice(0, 300) || null : null,
    recipient_name: snap.customer?.name || 'Cliente', recipient_phone: snap.customer?.phone || '',
    delivery_address: addressLine(snap.delivery) || '', collect_amount: amountToCollect(payment, order.total),
    idempotency_key: key,
  }).select(DELIVERY_COLS).maybeSingle()
  if (ins.error?.code === UNIQUE_VIOLATION) {
    const dup = await findByKey(auth.tenantId, key) // doble clic simultáneo con la misma clave
    if (dup) return res.status(200).json(deliveryView(dup, new Map([[driver.id, driver.name]])))
    return res.status(409).json({ error: 'El pedido ya tiene una entrega activa' })
  }
  if (ins.error) throw ins.error
  return res.status(201).json(deliveryView(ins.data, new Map([[driver.id, driver.name]])))
}

// GET /orders/deliveries?view=active|today&status=&location_id=
//   operador (manage_deliveries): entregas del punto, filtrables por estado.
//   domiciliario: SOLO las suyas (driver_id = quien llama).
export async function deliveriesList(req, res) {
  const auth = await requireCan(req, res, 'update_delivery'); if (!auth) return
  const manager = can(auth.seller.role, 'manage_deliveries')
  const { status, view = 'active' } = req.query || {}
  if (!['active', 'today'].includes(view)) return res.status(422).json({ error: 'view inválido' })
  if (status && !DELIVERY_STATUSES.includes(status)) return res.status(422).json({ error: 'status inválido' })

  let q = supabaseAdmin.from('deliveries').select(DELIVERY_COLS).eq('tenant_id', auth.tenantId)
  if (manager) {
    const locationId = scopedLocation(auth, req.query?.location_id, res, { allowAll: true })
    if (locationId === undefined) return
    if (locationId) q = q.eq('location_id', locationId)
  } else {
    q = q.eq('driver_id', auth.seller.id).in('location_id', auth.scope.locationIds)
  }
  if (manager && status) q = q.eq('status', status)
  else if (view === 'today') q = q.in('status', FINISHED_STATUSES).gte('updated_at', bogotaDayStart()).order('updated_at', { ascending: false })
  else q = q.in('status', ACTIVE_STATUSES).order('assigned_at', { ascending: true })

  const { data, error } = await q.limit(MAX_LIST)
  if (error) throw error
  const rows = data || []
  const names = await fetchDriverNames(auth.tenantId, rows.map(r => r.driver_id))
  return res.json(rows.map(d => deliveryView(d, names)))
}

// POST /orders/deliveries/:id/status  { status: 'picked_up' | 'delivered' | 'delivery_failed', reason? }
export async function deliveryStatus(req, res, id) {
  const auth = await requireCan(req, res, 'update_delivery'); if (!auth) return
  if (!UUID_RE.test(String(id))) return res.status(404).json({ error: 'Entrega no encontrada' })
  const { data: d } = await supabaseAdmin.from('deliveries').select(DELIVERY_COLS)
    .eq('id', id).eq('tenant_id', auth.tenantId).maybeSingle()
  if (!d) return res.status(404).json({ error: 'Entrega no encontrada' })

  if (can(auth.seller.role, 'manage_deliveries')) {
    if (denyOutOfScope(auth, d.location_id, res)) return
  } else if (d.driver_id !== auth.seller.id || !locationInScope(auth.scope, d.location_id)) {
    // El domiciliario no puede ni confirmar que existe una entrega ajena
    return res.status(404).json({ error: 'Entrega no encontrada' })
  }

  const target = req.body?.status
  if (!SETTABLE_STATUSES.includes(target)) return res.status(422).json({ error: 'Estado inválido' })
  let reason = null
  if (target === 'delivery_failed') {
    reason = typeof req.body?.reason === 'string' ? req.body.reason.trim().slice(0, 300) : ''
    if (reason.length < 3) return res.status(422).json({ error: 'Cuenta qué pasó: el motivo es obligatorio' })
  }

  const names = await fetchDriverNames(auth.tenantId, [d.driver_id])
  // Reintento del conductor (mala señal, doble toque): mismo resultado; repara un aviso que no se encoló
  if (d.status === target) {
    if (CUSTOMER_DELIVERY_STATUSES.includes(target)) await emitDeliveryEvent(d, target)
    return res.json(deliveryView(d, names))
  }
  if (!canDeliveryTransition(d.status, target)) {
    return res.status(409).json({ error: `No se puede pasar de ${d.status} a ${target}` })
  }

  const now = new Date().toISOString()
  const patch = {
    status: target, updated_at: now,
    ...(target === 'picked_up' && { picked_up_at: now }),
    ...(target === 'delivered' && { delivered_at: now }),
    ...(target === 'delivery_failed' && { failure_reason: reason }),
  }
  const { data: updated, error } = await supabaseAdmin.from('deliveries').update(patch)
    .eq('id', d.id).eq('tenant_id', auth.tenantId).eq('status', d.status) // guarda contra cambios concurrentes
    .select(DELIVERY_COLS).maybeSingle()
  if (error) throw error
  if (!updated) return res.status(409).json({ error: 'La entrega cambió mientras la actualizabas. Recarga e intenta de nuevo' })
  await emitDeliveryEvent(updated, target)
  return res.json(deliveryView(updated, names))
}
