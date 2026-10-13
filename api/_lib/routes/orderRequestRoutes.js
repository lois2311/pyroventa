import { supabaseAdmin } from '../supabaseAdmin.js'
import { requireCan } from '../auth.js'
import { scopedLocation, denyOutOfScope } from '../scopedLocation.js'
import { clientIp } from '../loginLock.js'
import { rejectIfRateLimited } from '../rateLimit.js'
import { resolvePublicOrderContext, fetchLocationCatalog, fetchActiveZones, toPresentationMap } from '../services/publicCatalogService.js'
import { emitOrderEvent, ORDER_EVENTS } from '../events/orderEvents.js'
import { listOrderDeliveries } from '../services/deliveryService.js'
import { parseQuoteRequest, buildQuote, DEFAULT_TTL_MINUTES } from '../services/quoteService.js'
import {
  ORDER_STATUSES, IDEMPOTENCY_RE, PUBLIC_TOKEN_RE,
  canTransition, evaluateAcceptance, canVerifyPayment, parseOrderBody, historyEntry, publicOrderView,
} from '../orderRules.js'

// =====================================================
// Vendra Pedidos — solicitudes de pedido (PR-03).
// Una solicitud NO es una factura: aquí no se llama a invoices, caja ni inventario.
// Toda consulta lleva tenant_id. El estado comercial `accepted` NO autoriza despacho.
// =====================================================

const UNIQUE_VIOLATION = '23505'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const notFound = (res) => res.status(404).json({ error: 'Pedidos no disponibles' })
const check = ({ error }) => { if (error) throw error }

/** Idempotency-Key obligatorio; responde 400 y devuelve null si falta o es inválido. */
export function idemKey(req, res) {
  const key = String(req.headers?.['idempotency-key'] || '').trim()
  if (!IDEMPOTENCY_RE.test(key)) {
    res.status(400).json({ error: 'Idempotency-Key requerido (8-128 caracteres: letras, números, - y _)' })
    return null
  }
  return key
}

const paymentOf = async (tenantId, orderId) => {
  const { data } = await supabaseAdmin.from('payment_records').select('*')
    .eq('tenant_id', tenantId).eq('order_request_id', orderId).maybeSingle()
  return data || null
}

// ---------------------------------------------------------------------------
// Públicas
// ---------------------------------------------------------------------------

async function findByKey(tenantId, key) {
  const { data } = await supabaseAdmin.from('order_requests').select('*')
    .eq('tenant_id', tenantId).eq('idempotency_key', key).maybeSingle()
  return data || null
}

async function upsertCustomer(tenantId, { name, phone }) {
  const find = () => supabaseAdmin.from('customers').select('id, consent_at')
    .eq('tenant_id', tenantId).eq('phone', phone).maybeSingle()
  const now = new Date().toISOString()
  let { data: customer } = await find()
  if (!customer) {
    const ins = await supabaseAdmin.from('customers')
      .insert({ tenant_id: tenantId, phone, name, consent_at: now }).select('id').maybeSingle()
    if (ins.error && ins.error.code !== UNIQUE_VIOLATION) throw ins.error
    customer = ins.data || (await find()).data // carrera: otro request lo creó primero
  } else {
    check(await supabaseAdmin.from('customers')
      .update({ name, updated_at: now, ...(customer.consent_at ? {} : { consent_at: now }) })
      .eq('id', customer.id).eq('tenant_id', tenantId))
  }
  return customer
}

// POST /public/orders/:slug/requests
export async function publicRequestCreate(req, res, slug) {
  if (rejectIfRateLimited(res, `orders-create:${clientIp(req)}`, { max: 10 })) return
  const ctx = await resolvePublicOrderContext(slug); if (!ctx) return notFound(res)
  const key = idemKey(req, res); if (!key) return

  // Reintento con la misma clave: mismo pedido, sin reinsertar
  const prior = await findByKey(ctx.tenantId, key)
  if (prior) {
    await emitOrderEvent(prior, ORDER_EVENTS.submitted) // idempotente: repara un encolado que falló la vez anterior
    return res.status(200).json(publicOrderView(prior, await paymentOf(ctx.tenantId, prior.id)))
  }

  const parsed = parseQuoteRequest(req.body)
  if (parsed.error) return res.status(parsed.status).json({ error: parsed.error })
  const q = parsed.value
  // Sin total esperado no hay confirmación del precio que vio el cliente
  if (q.expectedTotal === null) return res.status(422).json({ error: 'expected_total requerido' })
  const input = parseOrderBody(req.body, { fulfillment: q.fulfillment, paymentMethods: ctx.settings.payment_methods || [] })
  if (input.error) return res.status(input.status).json({ error: input.error })

  const [products, zones] = await Promise.all([
    fetchLocationCatalog(ctx.tenantId, ctx.locationId),
    fetchActiveZones(ctx.tenantId, ctx.locationId),
  ])
  const catalog = toPresentationMap(products)
  const result = buildQuote({
    ...q, catalog, zones, currency: ctx.settings.currency, ttlMinutes: ctx.settings.quote_ttl_minutes ?? DEFAULT_TTL_MINUTES,
  })
  if (result.error) return res.status(result.status).json({ error: result.error, quote: result.quote })
  const quote = result.quote
  const c = input.value

  const customer = await upsertCustomer(ctx.tenantId, c)
  let addressId = null
  if (c.address) {
    const { data, error } = await supabaseAdmin.from('customer_addresses')
      .insert({ tenant_id: ctx.tenantId, customer_id: customer.id, ...c.address }).select('id').maybeSingle()
    if (error) throw error
    addressId = data.id
  }

  const ins = await supabaseAdmin.from('order_requests').insert({
    tenant_id: ctx.tenantId, location_id: ctx.locationId, customer_id: customer.id, address_id: addressId,
    source: 'web', fulfillment: q.fulfillment, status: 'submitted',
    subtotal: quote.subtotal, delivery_fee: quote.delivery_fee, total: quote.total,
    snapshot: { quote, customer: { name: c.name, phone: c.phone }, delivery: c.address },
    notes: c.notes, history: [historyEntry('created', { to: 'submitted' })], idempotency_key: key,
  }).select('*').maybeSingle()
  if (ins.error?.code === UNIQUE_VIOLATION) { // doble envío simultáneo con la misma clave
    const dup = await findByKey(ctx.tenantId, key)
    if (dup) {
      await emitOrderEvent(dup, ORDER_EVENTS.submitted)
      return res.status(200).json(publicOrderView(dup, await paymentOf(ctx.tenantId, dup.id)))
    }
  }
  if (ins.error) throw ins.error
  const order = ins.data

  // ponytail: supabase-js no tiene transacciones; si fallan items/pago se borra la solicitud (compensación).
  // El snapshot ya guarda todo, así que los items son derivados. Atomicidad real: función RPC en Postgres.
  const items = quote.items.map(i => ({
    tenant_id: ctx.tenantId, order_request_id: order.id, product_id: catalog.get(i.presentation_id)?.product_id ?? null,
    presentation_id: i.presentation_id, name: i.product_name, label: i.label,
    unit_price: i.unit_price, quantity: i.quantity, subtotal: i.subtotal,
  }))
  const [itemsRes, payRes] = await Promise.all([
    supabaseAdmin.from('order_request_items').insert(items),
    supabaseAdmin.from('payment_records').insert({ tenant_id: ctx.tenantId, order_request_id: order.id, method: c.paymentMethod, status: 'pending' }).select('*').maybeSingle(),
  ])
  if (itemsRes.error || payRes.error) {
    await supabaseAdmin.from('order_requests').delete().eq('id', order.id).eq('tenant_id', ctx.tenantId)
    throw itemsRes.error || payRes.error
  }
  await emitOrderEvent(order, ORDER_EVENTS.submitted)
  return res.status(201).json(publicOrderView(order, payRes.data))
}

// GET /public/orders/requests/:token — el token opaco es la credencial
export async function publicRequestGet(req, res, token) {
  if (rejectIfRateLimited(res, `orders:${clientIp(req)}`)) return
  if (typeof token !== 'string' || !PUBLIC_TOKEN_RE.test(token)) return notFound(res)
  const { data: order } = await supabaseAdmin.from('order_requests').select('*').eq('public_token', token).maybeSingle()
  if (!order) return notFound(res)
  res.setHeader('Cache-Control', 'no-store')
  return res.json(publicOrderView(order, await paymentOf(order.tenant_id, order.id)))
}

// ---------------------------------------------------------------------------
// Administración (permiso manage_orders, alcance por sede)
// ---------------------------------------------------------------------------

/** Solicitud del tenant dentro del alcance del usuario; responde el error y devuelve null si no. */
async function loadOrder(auth, id, res) {
  if (!UUID_RE.test(String(id))) { res.status(404).json({ error: 'Pedido no encontrado' }); return null }
  const { data } = await supabaseAdmin.from('order_requests').select('*')
    .eq('id', id).eq('tenant_id', auth.tenantId).maybeSingle()
  if (!data) { res.status(404).json({ error: 'Pedido no encontrado' }); return null }
  if (denyOutOfScope(auth, data.location_id, res)) return null
  return data
}

/** Detalle completo con línea de tiempo (bitácora + resolución del pago). */
async function orderDetail(order) {
  const t = order.tenant_id
  const one = (table, id) => id ? supabaseAdmin.from(table).select('*').eq('id', id).eq('tenant_id', t).maybeSingle() : { data: null }
  const [{ data: customer }, { data: address }, { data: items }, payment, { data: settings }, deliveries] = await Promise.all([
    one('customers', order.customer_id),
    one('customer_addresses', order.address_id),
    supabaseAdmin.from('order_request_items').select('*').eq('tenant_id', t).eq('order_request_id', order.id),
    paymentOf(t, order.id),
    supabaseAdmin.from('order_settings').select('accept_policy').eq('tenant_id', t).eq('location_id', order.location_id).maybeSingle(),
    listOrderDeliveries(t, order.id), // historial logístico, separado del estado comercial
  ])
  const { idempotency_key: _k, history, ...rest } = order
  const timeline = [...(history || [])]
  if (payment?.verified_at) {
    timeline.push({ at: payment.verified_at, action: payment.status === 'manually_verified' ? 'payment_verified' : 'payment_rejected', actor: { id: payment.verified_by } })
  }
  timeline.sort((a, b) => String(a.at).localeCompare(String(b.at)))
  // accept_policy: la UI replica evaluateAcceptance para avisar antes de intentar aceptar (el servidor decide igual)
  return { ...rest, customer, address, items: items || [], payment, timeline, deliveries, accept_policy: settings?.accept_policy || 'require_verified' }
}

// GET /orders/requests?location_id=&status=
export async function ordersRequestsList(req, res) {
  const auth = await requireCan(req, res, 'manage_orders'); if (!auth) return
  const locationId = scopedLocation(auth, req.query?.location_id, res, { allowAll: true })
  if (locationId === undefined) return
  const { status } = req.query || {}
  if (status && !ORDER_STATUSES.includes(status)) return res.status(422).json({ error: 'status inválido' })

  let q = supabaseAdmin.from('order_requests')
    .select('id, location_id, customer_id, status, fulfillment, total, source, created_at, updated_at')
    .eq('tenant_id', auth.tenantId)
  if (locationId) q = q.eq('location_id', locationId)
  if (status) q = q.eq('status', status)
  const { data: orders, error } = await q.order('created_at', { ascending: false }).limit(100)
  if (error) throw error

  const rows = orders || []
  const ids = rows.map(o => o.id)
  const [{ data: customers }, { data: payments }] = ids.length ? await Promise.all([
    supabaseAdmin.from('customers').select('id, name, phone').eq('tenant_id', auth.tenantId).in('id', [...new Set(rows.map(o => o.customer_id))]),
    supabaseAdmin.from('payment_records').select('order_request_id, method, status').eq('tenant_id', auth.tenantId).in('order_request_id', ids),
  ]) : [{ data: [] }, { data: [] }]
  const cById = new Map((customers || []).map(c => [c.id, c]))
  const pById = new Map((payments || []).map(p => [p.order_request_id, p]))
  return res.json(rows.map(o => ({
    ...o,
    customer: cById.get(o.customer_id) ? { name: cById.get(o.customer_id).name, phone: cById.get(o.customer_id).phone } : null,
    payment: pById.get(o.id) ? { method: pById.get(o.id).method, status: pById.get(o.id).status } : null,
  })))
}

// GET /orders/requests/:id
export async function ordersRequestGet(req, res, id) {
  const auth = await requireCan(req, res, 'manage_orders'); if (!auth) return
  const order = await loadOrder(auth, id, res); if (!order) return
  return res.json(await orderDetail(order))
}

/** Transición comercial guardada: solo se aplica si el estado no cambió mientras tanto. */
async function transition(req, res, id, target) {
  const auth = await requireCan(req, res, 'manage_orders'); if (!auth) return
  const key = idemKey(req, res); if (!key) return
  const order = await loadOrder(auth, id, res); if (!order) return

  // Reintento de la misma operación: devuelve el resultado actual
  const eventType = target === 'accepted' ? ORDER_EVENTS.accepted : ORDER_EVENTS.rejected
  if ((order.history || []).some(h => h.key === key)) {
    await emitOrderEvent(order, eventType) // idempotente: repara un encolado que falló la vez anterior
    return res.json(await orderDetail(order))
  }

  let reason = null
  if (target === 'rejected') {
    reason = typeof req.body?.reason === 'string' ? req.body.reason.trim().slice(0, 300) : ''
    if (reason.length < 3) return res.status(422).json({ error: 'El motivo del rechazo es obligatorio' })
  }
  if (!canTransition(order.status, target)) {
    return res.status(409).json({ error: `No se puede pasar de ${order.status} a ${target}` })
  }
  if (target === 'accepted') {
    const { data: settings } = await supabaseAdmin.from('order_settings').select('accept_policy')
      .eq('tenant_id', auth.tenantId).eq('location_id', order.location_id).maybeSingle()
    const verdict = evaluateAcceptance(await paymentOf(auth.tenantId, order.id), settings?.accept_policy)
    if (!verdict.ok) return res.status(verdict.status).json({ error: verdict.error })
  }

  const now = new Date().toISOString()
  const { data: updated, error } = await supabaseAdmin.from('order_requests')
    .update({
      status: target, updated_at: now, ...(reason && { reject_reason: reason }),
      history: [...(order.history || []), historyEntry(target === 'accepted' ? 'accept' : 'reject', { actor: auth.seller, from: order.status, to: target, reason, key })],
    })
    .eq('id', order.id).eq('tenant_id', auth.tenantId).eq('status', order.status) // guarda contra cambios concurrentes
    .select('*').maybeSingle()
  if (error) throw error
  if (!updated) return res.status(409).json({ error: 'El pedido cambió mientras lo revisabas. Recarga e intenta de nuevo' })
  await emitOrderEvent(updated, eventType)
  return res.json(await orderDetail(updated))
}

// POST /orders/requests/:id/accept — aceptación comercial; NO autoriza despacho ni crea factura
export const ordersRequestAccept = (req, res, id) => transition(req, res, id, 'accepted')
// POST /orders/requests/:id/reject
export const ordersRequestReject = (req, res, id) => transition(req, res, id, 'rejected')

// POST /orders/requests/:id/payment-verifications  { action: 'verify' | 'reject', reference?, proof_url? }
export async function ordersPaymentVerify(req, res, id) {
  const auth = await requireCan(req, res, 'manage_orders'); if (!auth) return
  if (!idemKey(req, res)) return
  const order = await loadOrder(auth, id, res); if (!order) return

  const target = { verify: 'manually_verified', reject: 'rejected' }[req.body?.action]
  const reference = typeof req.body?.reference === 'string' ? req.body.reference.trim().slice(0, 120) || null : null
  let proofUrl = null
  if (req.body?.proof_url) {
    try {
      const u = new URL(String(req.body.proof_url))
      if (u.protocol !== 'https:' || u.href.length > 500) throw new Error()
      proofUrl = u.href
    } catch { return res.status(422).json({ error: 'proof_url debe ser una URL https válida' }) }
  }
  if (['rejected', 'cancelled'].includes(order.status)) return res.status(409).json({ error: 'El pedido ya no admite cambios de pago' })

  const payment = await paymentOf(auth.tenantId, order.id)
  if (!payment) return res.status(409).json({ error: 'El pedido no tiene registro de pago' })
  const verdict = canVerifyPayment(payment, target)
  if (!verdict.ok) return res.status(verdict.status).json({ error: verdict.error })
  const eventType = target === 'manually_verified' ? ORDER_EVENTS.paymentVerified : ORDER_EVENTS.paymentRejected
  if (verdict.noop) {
    await emitOrderEvent(order, eventType)
    return res.json(await orderDetail(order))
  }

  const { data: updated, error } = await supabaseAdmin.from('payment_records')
    .update({ status: target, reference: reference ?? payment.reference, proof_url: proofUrl ?? payment.proof_url, verified_by: auth.seller.id, verified_at: new Date().toISOString() })
    .eq('id', payment.id).eq('tenant_id', auth.tenantId).eq('status', payment.status)
    .select('*').maybeSingle()
  if (error) throw error
  if (!updated) return res.status(409).json({ error: 'El pago cambió mientras lo revisabas. Recarga e intenta de nuevo' })
  await emitOrderEvent(order, eventType)
  return res.json(await orderDetail(order))
}
