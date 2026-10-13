import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { randomUUID, createHmac } from 'node:crypto'
import { _resetForTests } from '../rateLimit.js'

// =====================================================
// Prueba integral de Vendra Pedidos (plan maestro, Fase 8): del WhatsApp del cliente hasta la
// entrega, con duplicados, caídas del proveedor y dos empresas en la misma base.
// Corre las rutas reales contra una BD en memoria; solo el proveedor (fetch a Meta) es simulado.
// =====================================================

const state = vi.hoisted(() => ({ db: null, auth: null }))
vi.mock('../supabaseAdmin.js', async () => ({ supabaseAdmin: (await import('./memoryDb.js')).makeSupabase(() => state.db) }))
vi.mock('../auth.js', async () => {
  const { can } = await import('../roles.js')
  const requireCan = async (_req, res, action) => {
    if (!can(state.auth.seller.role, action)) { res.status(403).json({ error: 'No tienes permiso para esta acción' }); return null }
    return state.auth
  }
  return { requireCan, requireAuth: async () => state.auth }
})

const { whatsappWebhookPost } = await import('../routes/whatsappRoutes.js')
const { publicRequestCreate, ordersRequestAccept, ordersRequestGet, ordersRequestsList } = await import('../routes/orderRequestRoutes.js')
const { deliveryCreate, deliveryStatus, deliveriesList } = await import('../routes/deliveryRoutes.js')
const { conversationsList } = await import('../routes/conversationRoutes.js')
const { opsStatus, opsRetryOutbox } = await import('../routes/opsRoutes.js')
const { processBatch } = await import('../services/outboxService.js')
const { handlers } = await import('../events/handlers.js')

const SECRET = 'app-secret-integral'
const A = { tenant: randomUUID(), loc: randomUUID(), channel: randomUUID(), phoneId: 'PID-A', slug: 'piloto-a', token: 'WA_TOKEN_A', cashier: randomUUID(), admin: randomUUID(), driver: randomUUID() }
const B = { tenant: randomUUID(), loc: randomUUID(), channel: randomUUID(), phoneId: 'PID-B', slug: 'piloto-b', token: 'WA_TOKEN_B', admin: randomUUID() }
const WA_ID = '573001234567'
const P1 = randomUUID()

const authAs = (t, role, id) => ({ tenantId: t.tenant, seller: { id, name: role, role }, scope: { all: false, locationIds: [t.loc] } })
const respond = () => { const r = { code: 200, headers: {} }; r.status = (c) => { r.code = c; return r }; r.json = (b) => { r.body = b; return r }; r.send = (b) => { r.body = b; return r }; r.setHeader = (k, v) => { r.headers[k] = v }; return r }
const call = async (fn, req, ...args) => { const res = respond(); await fn(req, res, ...args); return res }
const asA = (role, id) => { state.auth = authAs(A, role, id) }

const seedTenant = (t) => {
  const db = state.db
  db.tenants.push({ id: t.tenant, name: `Empresa ${t.slug}`, active: true, license_start: '2020-01-01', license_end: '2099-12-31' })
  db.locations.push({ id: t.loc, tenant_id: t.tenant, name: 'Sede', active: true })
  db.order_settings.push({ tenant_id: t.tenant, location_id: t.loc, public_slug: t.slug, enabled: true, currency: 'COP', quote_ttl_minutes: 15, payment_methods: ['cash_on_delivery', 'transfer'], accept_policy: 'require_verified' })
  db.delivery_zones.push({ id: randomUUID(), tenant_id: t.tenant, location_id: t.loc, name: 'Ciudad', fee: 5000, active: true })
  db.products.push({ id: randomUUID(), tenant_id: t.tenant, name: 'VOLCAN', active: true, description: null, image_url: null, category_id: null, categories: null,
    presentations: [{ id: t === A ? P1 : randomUUID(), label: 'Unidad', price: 10000, active: true }] })
  db.whatsapp_channels.push({ id: t.channel, tenant_id: t.tenant, location_id: t.loc, provider: 'meta', phone_number_id: t.phoneId, status: 'active', webhook_verify_token: `v-${t.slug}`, access_token_secret_ref: t.token })
}

let metaCalls
const metaFetch = (behavior = () => ({ ok: true, status: 200, body: null })) => vi.fn(async (url, opts) => {
  const body = JSON.parse(opts.body)
  const r = behavior({ url, opts, body })
  metaCalls.push({ url, token: opts.headers.Authorization, to: body.to, text: body.text.body })
  const json = r.ok ? { messages: [{ id: `wamid.OUT${metaCalls.length}` }] } : { error: { code: r.code || 131000, message: 'fallo simulado' } }
  return { ok: r.ok, status: r.status, json: async () => json }
})

beforeEach(() => {
  _resetForTests()
  process.env.META_APP_SECRET = SECRET
  process.env.WA_TOKEN_A = 'tok-A'; process.env.WA_TOKEN_B = 'tok-B'
  metaCalls = []
  state.db = {
    tenants: [], locations: [], order_settings: [], delivery_zones: [], products: [], whatsapp_channels: [],
    location_products: [], location_prices: [], order_customers: [], customer_addresses: [], order_requests: [], order_request_items: [],
    payment_records: [], conversations: [], messages: [], integration_events: [], connect_outbox: [], deliveries: [],
    sellers: [
      { id: A.cashier, tenant_id: A.tenant, name: 'Cajera A', role: 'cashier', active: true },
      { id: A.admin, tenant_id: A.tenant, name: 'Admin A', role: 'admin', active: true },
      { id: A.driver, tenant_id: A.tenant, name: 'Domi A', role: 'driver', active: true },
    ],
    seller_locations: [A.cashier, A.admin, A.driver].map(id => ({ tenant_id: A.tenant, seller_id: id, location_id: A.loc })),
  }
  seedTenant(A); seedTenant(B)
  vi.stubGlobal('fetch', metaFetch())
})
afterEach(() => { vi.unstubAllGlobals(); delete process.env.META_APP_SECRET; delete process.env.WA_TOKEN_A; delete process.env.WA_TOKEN_B })

// ---- Utilidades de escenario -------------------------
const waRaw = (messages, phoneId = A.phoneId) => JSON.stringify({ object: 'whatsapp_business_account', entry: [{ id: '1', changes: [{ field: 'messages', value: {
  messaging_product: 'whatsapp', metadata: { phone_number_id: phoneId }, contacts: [{ wa_id: WA_ID, profile: { name: 'Ana Pérez' } }], messages } }] }] })
const inbound = (id = 'wamid.IN1', phoneId = A.phoneId) => {
  const rawBody = waRaw([{ id, from: WA_ID, timestamp: String(Math.floor(Date.now() / 1000)), type: 'text', text: { body: 'Hola, quiero pedir volcanes' } }], phoneId)
  const sig = `sha256=${createHmac('sha256', SECRET).update(rawBody).digest('hex')}`
  return call(whatsappWebhookPost, { headers: { 'x-hub-signature-256': sig, 'x-forwarded-for': '9.9.9.9' }, rawBody }, 'meta')
}
const orderBody = (over = {}) => ({
  items: [{ presentation_id: P1, quantity: 2 }], expected_total: 25000, fulfillment: 'delivery',
  customer: { name: 'Ana Pérez', phone: '300 123 4567' }, address: { address: 'Calle 45 # 12-30', details: 'Apto 402' },
  payment_method: 'cash_on_delivery', consent: true, ...over,
})
const submitOrder = (key = `k-${randomUUID()}`, body = orderBody(), slug = A.slug) =>
  call(publicRequestCreate, { headers: { 'idempotency-key': key, 'x-forwarded-for': `10.0.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` }, body }, slug)
const adminReq = (over = {}) => ({ headers: { 'idempotency-key': `adm-${randomUUID()}` }, query: {}, body: {}, ...over })
const runWorker = (opts = {}) => processBatch({ handlers, ...opts })
const outbox = (type) => state.db.connect_outbox.filter(e => !type || e.event_type === type)
const FORBIDDEN_TABLES = ['invoices', 'stock', 'stock_movements', 'register_closures', 'registers', 'price_audit_logs']

// =====================================================
describe('flujo completo: WhatsApp → pedido → aceptación → domicilio → entrega', () => {
  it('cada paso deja su rastro, el cliente recibe sus avisos y el POS no se toca', async () => {
    // 1. El cliente escribe por WhatsApp
    expect((await inbound()).code).toBe(200)
    expect(state.db.conversations).toHaveLength(1)

    // 2. Envía el pedido por el formulario con el mismo teléfono
    const created = await submitOrder()
    expect(created.code).toBe(201)
    expect(created.body).toMatchObject({ status: 'submitted', total: 25000 })
    const order = state.db.order_requests[0]

    // 3. La cajera lo acepta (comercial) — todavía no hay despacho
    asA('cashier', A.cashier)
    expect((await call(ordersRequestAccept, adminReq(), order.id)).body.status).toBe('accepted')
    expect(state.db.deliveries).toHaveLength(0)

    // 4. El worker entrega los avisos dentro de la ventana de 24 h
    const w1 = await runWorker()
    expect(w1).toMatchObject({ claimed: 2, delivered: 2, failed: 0 })
    const texts = metaCalls.map(c => c.text)
    expect(texts.some(t => /Recibimos tu pedido/.test(t))).toBe(true)
    expect(texts.some(t => t.includes('fue aceptado. Total: $25.000'))).toBe(true)
    expect(metaCalls.every(c => c.to === WA_ID && c.token === 'Bearer tok-A')).toBe(true)

    // 5. El administrador autoriza el despacho asignando un domiciliario
    asA('admin', A.admin)
    const assigned = await call(deliveryCreate, { headers: { 'idempotency-key': 'asignar-0001' }, body: { driver_id: A.driver } }, order.id)
    expect(assigned.code).toBe(201)
    expect(assigned.body.collect_amount).toBe(25000)

    // 6. El domiciliario recoge y entrega
    const d = state.db.deliveries[0]
    state.auth = authAs(A, 'driver', A.driver)
    expect((await call(deliveriesList, { query: {} })).body).toHaveLength(1)
    expect((await call(deliveryStatus, { body: { status: 'picked_up' } }, d.id)).code).toBe(200)
    expect((await call(deliveryStatus, { body: { status: 'delivered' } }, d.id)).code).toBe(200)

    // 7. Avisos de logística al cliente
    await runWorker()
    expect(metaCalls.map(c => c.text).slice(-2)).toEqual(['Tu pedido #' + order.id.slice(0, 8).toUpperCase() + ' ya va en camino.', expect.stringContaining('fue entregado')])
    expect(metaCalls).toHaveLength(4)

    // 8. Trazabilidad: todo entregado, nada fallido, estado comercial separado del logístico
    expect(state.db.connect_outbox.every(e => e.status === 'delivered')).toBe(true)
    expect(state.db.order_requests[0].status).toBe('accepted')
    expect(state.db.deliveries[0].status).toBe('delivered')
    expect(state.db.messages.filter(m => m.direction === 'outbound' && m.status === 'sent')).toHaveLength(4)
    expect(state.db.order_requests[0].history.map(h => h.action)).toEqual(['created', 'accept'])

    // 9. El POS no se toca: ni facturas, ni caja, ni inventario
    for (const t of FORBIDDEN_TABLES) expect(state.db[t], t).toBeUndefined()

    // 10. La otra empresa no tiene ni una fila
    for (const [table, rows] of Object.entries(state.db)) {
      if (['tenants', 'locations', 'order_settings', 'delivery_zones', 'products', 'whatsapp_channels', 'sellers', 'seller_locations'].includes(table)) continue
      expect(rows.filter(r => r.tenant_id === B.tenant), table).toHaveLength(0)
      expect(rows.every(r => r.tenant_id === A.tenant), `${table} con filas sin tenant`).toBe(true)
    }

    // 11. Soporte ve los números del piloto
    asA('admin', A.admin)
    const ops = await call(opsStatus, { query: {} })
    expect(ops.body.metrics.orders).toMatchObject({ created: 1, accepted: 1, rejected: 0 })
    expect(ops.body.metrics.deliveries).toMatchObject({ assigned: 1, delivered: 1, failed: 0 })
    expect(ops.body.health.outbox).toMatchObject({ pending: 0, failed: 0 })
  })
})

describe('duplicados y reintentos: ningún efecto comercial se repite', () => {
  it('el mismo webhook, la misma solicitud y la misma aceptación varias veces', async () => {
    await inbound(); await inbound(); await inbound()
    expect(state.db.messages.filter(m => m.direction === 'inbound')).toHaveLength(1)
    expect(state.db.conversations).toHaveLength(1)

    const key = 'solicitud-repetida-1'
    const [r1, r2, r3] = [await submitOrder(key), await submitOrder(key), await submitOrder(key)]
    expect([r1.code, r2.code, r3.code]).toEqual([201, 200, 200])
    expect(state.db.order_requests).toHaveLength(1)
    expect(state.db.payment_records).toHaveLength(1)

    asA('cashier', A.cashier)
    const req = adminReq({ headers: { 'idempotency-key': 'aceptar-repetido' } })
    const id = state.db.order_requests[0].id
    await call(ordersRequestAccept, req, id); await call(ordersRequestAccept, req, id)
    await runWorker(); await runWorker()
    expect(outbox('order.accepted')).toHaveLength(1)
    expect(metaCalls).toHaveLength(2) // submitted + accepted, una vez cada uno
  })

  it('carga: 30 envíos simultáneos con la misma clave crean UN pedido', async () => {
    const results = await Promise.all(Array.from({ length: 30 }, () => submitOrder('carga-misma-clave')))
    expect(results.filter(r => r.code === 201)).toHaveLength(1)
    expect(results.every(r => [200, 201].includes(r.code))).toBe(true)
    expect(new Set(results.map(r => r.body.public_token)).size).toBe(1)
    expect(state.db.order_requests).toHaveLength(1)
    expect(state.db.order_customers).toHaveLength(1)
    expect(state.db.payment_records).toHaveLength(1)
    expect(outbox('order.submitted')).toHaveLength(1)
  })

  it('carga: pedidos distintos del mismo cliente reutilizan al cliente', async () => {
    await Promise.all(Array.from({ length: 10 }, (_, i) => submitOrder(`distinta-${i}`)))
    expect(state.db.order_requests).toHaveLength(10)
    expect(state.db.order_customers).toHaveLength(1)
  })
})

describe('caídas del proveedor: la notificación no se pierde y es recuperable', () => {
  const setup = async () => {
    await inbound()
    await submitOrder()
    asA('cashier', A.cashier)
    await call(ordersRequestAccept, adminReq(), state.db.order_requests[0].id)
  }

  it('Meta cae: reintenta con espera, no duplica y entrega al volver', async () => {
    await setup()
    vi.stubGlobal('fetch', metaFetch(() => ({ ok: false, status: 503 })))
    const down = await runWorker()
    expect(down).toMatchObject({ claimed: 2, retried: 2, delivered: 0 })
    expect(state.db.connect_outbox.every(e => e.status === 'pending' && e.attempts === 1 && e.error_details)).toBe(true)
    expect(state.db.messages.filter(m => m.direction === 'outbound').every(m => m.status === 'queued')).toBe(true)

    vi.stubGlobal('fetch', metaFetch())
    metaCalls = []
    const later = new Date(Date.now() + 2 * 3600_000)
    expect(await runWorker({ now: later })).toMatchObject({ delivered: 2 })
    expect(metaCalls).toHaveLength(2)
    expect(state.db.messages.filter(m => m.direction === 'outbound' && m.status === 'sent')).toHaveLength(2)
  })

  it('agota los intentos: queda failed y visible para soporte, y se puede reintentar', async () => {
    await setup()
    vi.stubGlobal('fetch', metaFetch(() => ({ ok: false, status: 500 })))
    let clock = Date.now()
    for (let i = 0; i < 5; i++) { await runWorker({ now: new Date(clock) }); clock += 2 * 3600_000 }
    expect(state.db.connect_outbox.every(e => e.status === 'failed' && e.attempts === 5)).toBe(true)
    expect(state.db.messages.filter(m => m.direction === 'outbound').every(m => m.status === 'failed')).toBe(true)

    asA('admin', A.admin)
    const ops = await call(opsStatus, { query: {} })
    expect(ops.body.health.outbox.failed).toBe(2)
    expect(ops.body.health.messages_failed).toBe(2)
    expect(ops.body.failed).toHaveLength(2)
    expect(ops.body.failed[0]).toMatchObject({ attempts: 5 })
    expect(ops.body.failed[0]).not.toHaveProperty('payload')

    // Meta se recupera y soporte reintenta
    vi.stubGlobal('fetch', metaFetch()); metaCalls = []
    for (const f of ops.body.failed) expect((await call(opsRetryOutbox, { query: {} }, f.id)).code).toBe(200)
    expect((await call(opsRetryOutbox, { query: {} }, ops.body.failed[0].id)).code).toBe(409) // ya no está fallido
    expect(await runWorker()).toMatchObject({ delivered: 2, failed: 0 })
    expect(metaCalls).toHaveLength(2)
    expect(state.db.messages.filter(m => m.direction === 'outbound').every(m => m.status === 'sent')).toBe(true)
  })

  it('fuera de la ventana de 24 h: falla permanente (sin plantillas) y visible, sin enviar nada', async () => {
    await setup()
    state.db.conversations[0].last_inbound_at = new Date(Date.now() - 25 * 3600_000).toISOString()
    expect(await runWorker()).toMatchObject({ failed: 2, delivered: 0 })
    expect(metaCalls).toHaveLength(0)
    expect(state.db.connect_outbox.every(e => e.status === 'failed' && /ventana|plantilla/.test(e.error_details))).toBe(true)
  })

  it('canal desconectado: no origina conversaciones nuevas ni envía', async () => {
    state.db.whatsapp_channels[0].status = 'disconnected'
    await inbound()
    expect(state.db.conversations).toHaveLength(0)
    expect(state.db.integration_events[0]).toMatchObject({ status: 'ignored', error_details: 'channel_disconnected' })
    await submitOrder()
    asA('cashier', A.cashier)
    await call(ordersRequestAccept, adminReq(), state.db.order_requests[0].id)
    await runWorker()
    expect(metaCalls).toHaveLength(0)
    expect(state.db.connect_outbox.every(e => e.status === 'failed')).toBe(true) // sin canal activo: visible, no perdido
  })
})

describe('aislamiento entre empresas con la misma base', () => {
  it('el administrador de B no ve ni toca nada de A', async () => {
    await inbound(); await submitOrder()
    asA('cashier', A.cashier)
    const id = state.db.order_requests[0].id
    await call(ordersRequestAccept, adminReq(), id)
    asA('admin', A.admin)
    await call(deliveryCreate, { headers: { 'idempotency-key': 'asignar-aislado' }, body: { driver_id: A.driver } }, id)
    const delivery = state.db.deliveries[0]
    await runWorker()

    state.auth = authAs(B, 'admin', B.admin)
    state.auth.scope.locationIds = [B.loc]
    expect((await call(ordersRequestsList, { query: {} })).body).toEqual([])
    expect((await call(ordersRequestGet, { query: {} }, id)).code).toBe(404)
    expect((await call(ordersRequestAccept, adminReq(), id)).code).toBe(404)
    expect((await call(deliveriesList, { query: {} })).body).toEqual([])
    expect((await call(deliveryStatus, { body: { status: 'picked_up' } }, delivery.id)).code).toBe(404)
    expect((await call(conversationsList, { query: {} })).body).toEqual([])
    const ops = await call(opsStatus, { query: {} })
    expect(ops.body.metrics.orders.created).toBe(0)
    expect(ops.body.failed).toEqual([])
    expect(state.db.deliveries[0].status).toBe('assigned')
    // y un mensaje al número de B no cae en A
    await inbound('wamid.INB', B.phoneId)
    expect(state.db.conversations.filter(c => c.tenant_id === B.tenant)).toHaveLength(1)
    expect(state.db.conversations.filter(c => c.tenant_id === A.tenant)).toHaveLength(1)
  })
})
