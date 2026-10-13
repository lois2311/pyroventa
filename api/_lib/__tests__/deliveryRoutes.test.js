import { describe, it, expect, beforeEach, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { canDeliveryTransition, bogotaDayStart, addressLine, amountToCollect } from '../deliveryRules.js'
import { signToken, verifyJwt } from '../jwt.js'

const state = vi.hoisted(() => ({ db: null, auth: null }))
const TENANT_SCOPED = ['deliveries', 'sellers', 'seller_locations', 'order_requests', 'payment_records', 'connect_outbox']
vi.mock('../supabaseAdmin.js', async () => ({ supabaseAdmin: (await import('./memoryDb.js')).makeSupabase(() => state.db, { tenantScoped: TENANT_SCOPED }) }))
vi.mock('../auth.js', async () => {
  const { can } = await import('../roles.js')
  const requireCan = async (_req, res, action) => {
    if (!can(state.auth.seller.role, action)) { res.status(403).json({ error: 'No tienes permiso para esta acción' }); return null }
    return state.auth
  }
  return { requireCan, requireAuth: async () => state.auth }
})

const { deliveryCreate, deliveriesList, deliveryStatus, driversList } = await import('../routes/deliveryRoutes.js')
const { ordersRequestGet } = await import('../routes/orderRequestRoutes.js')
const { authLogin } = await import('../routes/authRoutes.js')

const TENANT = randomUUID(), OTHER_TENANT = randomUUID()
const LOC = randomUUID(), OTHER_LOC = randomUUID()
const D1 = randomUUID(), D2 = randomUUID(), D_OFF = randomUUID(), SELLER = randomUUID(), ADMIN = randomUUID()

const authAs = (role, id, locationIds = [LOC]) => ({ tenantId: TENANT, seller: { id, name: role, role }, scope: { all: false, locationIds } })
const respond = () => { const r = { code: 200 }; r.status = (c) => { r.code = c; return r }; r.json = (b) => { r.body = b; return r }; return r }
const call = async (fn, req, ...args) => { const res = respond(); await fn(req, res, ...args); return res }
const key = () => ({ 'idempotency-key': `k-${randomUUID()}` })

const order = (over = {}) => ({
  id: randomUUID(), tenant_id: TENANT, location_id: LOC, status: 'accepted', fulfillment: 'delivery', total: 25000,
  snapshot: { customer: { name: 'Ana Pérez', phone: '+573001234567' }, delivery: { address: 'Calle 45 # 12-30', details: 'Apto 402', reference_notes: 'Frente al parque' } },
  ...over,
})
let o
const seedOrder = (over = {}, payment = { method: 'cash_on_delivery', status: 'pending' }) => {
  const x = order(over)
  state.db.order_requests.push(x)
  state.db.payment_records.push({ id: randomUUID(), tenant_id: TENANT, order_request_id: x.id, ...payment })
  return x
}
const assign = (ord, driverId = D1, headers = key(), extra = {}) =>
  call(deliveryCreate, { headers, body: { driver_id: driverId, ...extra } }, ord.id)
const seedDelivery = (over = {}) => {
  const d = { id: randomUUID(), tenant_id: TENANT, location_id: LOC, order_request_id: randomUUID(), driver_id: D1, status: 'assigned',
    recipient_name: 'Ana', recipient_phone: '+573001234567', delivery_address: 'Calle 1', collect_amount: 0, assigned_at: new Date().toISOString(),
    created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...over }
  state.db.deliveries.push(d)
  return d
}
const events = () => state.db.connect_outbox

beforeEach(() => {
  state.db = {
    order_requests: [], payment_records: [], deliveries: [], connect_outbox: [],
    sellers: [
      { id: D1, tenant_id: TENANT, name: 'Carlos Ruiz', role: 'driver', active: true },
      { id: D2, tenant_id: TENANT, name: 'Beatriz Soto', role: 'driver', active: true },
      { id: D_OFF, tenant_id: TENANT, name: 'Inactivo', role: 'driver', active: false },
      { id: SELLER, tenant_id: TENANT, name: 'Vendedor', role: 'seller', active: true },
    ],
    seller_locations: [D1, D2, D_OFF, SELLER].map(id => ({ tenant_id: TENANT, seller_id: id, location_id: LOC })),
  }
  state.auth = authAs('admin', ADMIN)
  o = seedOrder()
})

// ---- Reglas puras ------------------------------------
describe('reglas de entrega', () => {
  it('máquina de estados: no se entrega lo que no se recogió; terminales no cambian', () => {
    expect(canDeliveryTransition('assigned', 'picked_up')).toBe(true)
    expect(canDeliveryTransition('picked_up', 'delivered')).toBe(true)
    expect(canDeliveryTransition('assigned', 'delivered')).toBe(false)
    expect(canDeliveryTransition('assigned', 'delivery_failed')).toBe(true)
    expect(canDeliveryTransition('delivered', 'picked_up')).toBe(false)
    expect(canDeliveryTransition('delivery_failed', 'assigned')).toBe(false)
  })
  it('dirección, efectivo a cobrar y día de Bogotá', () => {
    expect(addressLine({ address: 'Calle 1', details: 'Apto 2', reference_notes: 'Parque' })).toBe('Calle 1 · Apto 2 · Ref.: Parque')
    expect(addressLine(null)).toBeNull()
    expect(amountToCollect({ method: 'cash_on_delivery' }, '25000.00')).toBe(25000)
    expect(amountToCollect({ method: 'transfer' }, 25000)).toBe(0)
    expect(bogotaDayStart(new Date('2026-10-15T03:00:00Z'))).toBe('2026-10-14T05:00:00.000Z') // 22:00 del 14 en Bogotá
  })
})

// ---- Crear entrega -----------------------------------
describe('POST /orders/requests/:id/deliveries', () => {
  it('asigna: crea la entrega en assigned con los datos del destinatario y el efectivo a cobrar', async () => {
    const res = await assign(o, D1, key(), { instructions: 'Dejar con el portero' })
    expect(res.code).toBe(201)
    expect(res.body).toMatchObject({
      status: 'assigned', recipient_name: 'Ana Pérez', recipient_phone: '+573001234567', collect_amount: 25000,
      delivery_address: 'Calle 45 # 12-30 · Apto 402 · Ref.: Frente al parque', instructions: 'Dejar con el portero',
      driver: { id: D1, name: 'Carlos Ruiz' }, order_code: o.id.slice(0, 8).toUpperCase(),
    })
    expect(res.body).not.toHaveProperty('tenant_id')
    expect(state.db.deliveries[0]).toMatchObject({ tenant_id: TENANT, location_id: LOC, order_request_id: o.id, driver_id: D1 })
    // El pedido no cambia de estado comercial y no se toca facturación, caja ni inventario
    expect(state.db.order_requests[0].status).toBe('accepted')
    for (const t of ['invoices', 'stock', 'stock_movements', 'register_closures', 'registers']) expect(state.db[t]).toBeUndefined()
  })

  it('transferencia ya pagada: no hay efectivo que cobrar', async () => {
    const t = seedOrder({}, { method: 'transfer', status: 'manually_verified' })
    expect((await assign(t)).body.collect_amount).toBe(0)
  })

  it('solo se despachan pedidos aceptados (draft, enviado, en revisión, rechazado o cancelado → 409)', async () => {
    for (const status of ['draft', 'submitted', 'under_review', 'rejected', 'cancelled']) {
      const x = seedOrder({ status })
      const res = await assign(x)
      expect(res.code, status).toBe(409)
      expect(res.body.error).toMatch(/aceptados/)
    }
    expect(state.db.deliveries).toHaveLength(0)
  })

  it('un pedido para recoger en tienda no tiene domicilio', async () => {
    const x = seedOrder({ fulfillment: 'pickup' })
    expect((await assign(x)).code).toBe(409)
  })

  it('valida clave, domiciliario y permisos', async () => {
    expect((await call(deliveryCreate, { headers: {}, body: { driver_id: D1 } }, o.id)).code).toBe(400)
    expect((await assign(o, 'no-uuid')).code).toBe(422)
    expect((await assign(o, SELLER)).code).toBe(422)         // no es domiciliario
    expect((await assign(o, D_OFF)).code).toBe(422)          // inactivo
    state.db.seller_locations = state.db.seller_locations.filter(l => l.seller_id !== D2)
    expect((await assign(o, D2)).code).toBe(422)             // no trabaja en este punto
    state.auth = authAs('cashier', randomUUID())
    expect((await assign(o)).code).toBe(403)                 // el cajero no despacha
    state.auth = authAs('driver', D1)
    expect((await assign(o)).code).toBe(403)                 // el domiciliario tampoco asigna
    expect(state.db.deliveries).toHaveLength(0)
  })

  it('aislamiento: pedido de otra empresa → 404; de una sede fuera de alcance → 403', async () => {
    const foreign = seedOrder({ tenant_id: OTHER_TENANT })
    expect((await assign(foreign)).code).toBe(404)
    const far = seedOrder({ location_id: OTHER_LOC })
    expect((await assign(far)).code).toBe(403)
    expect((await call(deliveryCreate, { headers: key(), body: { driver_id: D1 } }, 'no-uuid')).code).toBe(404)
  })

  it('idempotente: misma clave → misma entrega; otra entrega activa → 409; tras un fallo se puede reasignar', async () => {
    const headers = key()
    const first = await assign(o, D1, headers)
    const again = await assign(o, D1, headers)
    expect(again.code).toBe(200)
    expect(again.body.id).toBe(first.body.id)
    expect(state.db.deliveries).toHaveLength(1)
    expect((await assign(o, D2)).code).toBe(409)                       // ya tiene una entrega activa
    expect((await assign(seedOrder(), D1, headers)).code).toBe(409)    // clave usada en otro pedido

    state.db.deliveries[0].status = 'delivery_failed'
    const retry = await assign(o, D2)
    expect(retry.code).toBe(201)
    expect(state.db.deliveries).toHaveLength(2)
  })
})

// ---- Domiciliarios del punto -------------------------
describe('GET /orders/drivers', () => {
  it('lista solo domiciliarios activos del punto', async () => {
    const res = await call(driversList, { query: {} })
    expect(res.body).toEqual([{ id: D2, name: 'Beatriz Soto' }, { id: D1, name: 'Carlos Ruiz' }].sort((a, b) => a.name.localeCompare(b.name, 'es')))
  })
  it('un domiciliario o cajero no puede listar; sede ajena → 403', async () => {
    state.auth = authAs('driver', D1)
    expect((await call(driversList, { query: {} })).code).toBe(403)
    state.auth = authAs('admin', ADMIN)
    expect((await call(driversList, { query: { location_id: OTHER_LOC } })).code).toBe(403)
  })
})

// ---- Listado: operador vs domiciliario ---------------
describe('GET /orders/deliveries', () => {
  it('el domiciliario ve SOLO sus entregas activas; el operador ve las del punto', async () => {
    const mine = seedDelivery({ status: 'assigned' })
    const mine2 = seedDelivery({ status: 'picked_up' })
    seedDelivery({ driver_id: D2 })                               // de otro domiciliario
    seedDelivery({ status: 'delivered', updated_at: new Date().toISOString() })  // terminada
    seedDelivery({ location_id: OTHER_LOC })                      // de una sede que no es la suya
    state.auth = authAs('driver', D1)
    const res = await call(deliveriesList, { query: {} })
    expect(res.body.map(d => d.id).sort()).toEqual([mine.id, mine2.id].sort())
    // no puede ampliar el alcance con parámetros
    const sneaky = await call(deliveriesList, { query: { location_id: OTHER_LOC, status: 'delivered' } })
    expect(sneaky.body.every(d => d.driver.id === D1)).toBe(true)
    expect(sneaky.body.map(d => d.id).sort()).toEqual([mine.id, mine2.id].sort())

    state.auth = authAs('admin', ADMIN)
    expect((await call(deliveriesList, { query: {} })).body).toHaveLength(3) // activas del punto LOC: las dos de D1 y la de D2 (no la terminada ni la de OTHER_LOC)
    expect((await call(deliveriesList, { query: { status: 'delivered' } })).body).toHaveLength(1)
    expect((await call(deliveriesList, { query: { location_id: OTHER_LOC } })).code).toBe(403)
  })

  it('historial de hoy: solo las terminadas hoy y propias', async () => {
    const today = seedDelivery({ status: 'delivered', updated_at: new Date().toISOString() })
    seedDelivery({ status: 'delivery_failed', updated_at: new Date(Date.now() - 3 * 86400_000).toISOString() })
    seedDelivery({ status: 'delivered', driver_id: D2, updated_at: new Date().toISOString() })
    seedDelivery({ status: 'assigned' })
    state.auth = authAs('driver', D1)
    const res = await call(deliveriesList, { query: { view: 'today' } })
    expect(res.body.map(d => d.id)).toEqual([today.id])
  })

  it('valida filtros y permisos', async () => {
    expect((await call(deliveriesList, { query: { view: 'x' } })).code).toBe(422)
    expect((await call(deliveriesList, { query: { status: 'x' } })).code).toBe(422)
    state.auth = authAs('cashier', randomUUID())
    expect((await call(deliveriesList, { query: {} })).code).toBe(403)
  })
})

// ---- Estados -----------------------------------------
describe('POST /orders/deliveries/:id/status', () => {
  const post = (d, body, auth = authAs('driver', D1)) => { state.auth = auth; return call(deliveryStatus, { body }, d.id) }

  it('flujo completo del domiciliario: recogido → entregado, con marcas de tiempo y avisos al cliente', async () => {
    const d = seedDelivery()
    const p = await post(d, { status: 'picked_up' })
    expect(p.code).toBe(200)
    expect(p.body.status).toBe('picked_up')
    expect(state.db.deliveries[0].picked_up_at).toBeTruthy()
    const done = await post(d, { status: 'delivered' })
    expect(done.body.status).toBe('delivered')
    expect(state.db.deliveries[0].delivered_at).toBeTruthy()
    expect(events().map(e => [e.event_type, e.payload.status])).toEqual([['order.delivery_status_changed', 'picked_up'], ['order.delivery_status_changed', 'delivered']])
    expect(events().every(e => e.tenant_id === TENANT && e.aggregate_type === 'order_request' && e.aggregate_id === d.order_request_id)).toBe(true)
    expect(state.db.invoices).toBeUndefined()
    expect(state.db.stock).toBeUndefined()
  })

  it('transición inválida → 409 (entregar sin recoger, retroceder, reabrir)', async () => {
    const d = seedDelivery()
    const skip = await post(d, { status: 'delivered' })
    expect(skip.code).toBe(409)
    expect(state.db.deliveries[0].status).toBe('assigned')
    await post(d, { status: 'picked_up' }); await post(d, { status: 'delivered' })
    expect((await post(d, { status: 'picked_up' })).code).toBe(409)
    expect((await post(d, { status: 'delivery_failed', reason: 'Nadie abrió' })).code).toBe(409)
    expect((await post(d, { status: 'assigned' })).code).toBe(422)
  })

  it('repetir el mismo estado (mala señal) es idempotente y no duplica el aviso', async () => {
    const d = seedDelivery()
    await post(d, { status: 'picked_up' }); const again = await post(d, { status: 'picked_up' })
    expect(again.code).toBe(200)
    expect(events()).toHaveLength(1)
  })

  it('novedad: el motivo es obligatorio y se guarda; falla desde asignada o recogida', async () => {
    const d = seedDelivery(); const e = seedDelivery()
    expect((await post(d, { status: 'delivery_failed' })).code).toBe(422)
    expect((await post(d, { status: 'delivery_failed', reason: 'ab' })).code).toBe(422)
    const ok = await post(d, { status: 'delivery_failed', reason: 'Nadie abrió la puerta' })
    expect(ok.body).toMatchObject({ status: 'delivery_failed', failure_reason: 'Nadie abrió la puerta' })
    await post(e, { status: 'picked_up' })
    expect((await post(e, { status: 'delivery_failed', reason: 'Dirección inexistente' })).code).toBe(200)
    expect(events().map(x => x.payload.status)).toEqual(['delivery_failed', 'picked_up', 'delivery_failed'])
  })

  it('aislamiento entre domiciliarios: la entrega de otro responde 404 y no se modifica', async () => {
    const d = seedDelivery({ driver_id: D1 })
    const res = await post(d, { status: 'picked_up' }, authAs('driver', D2))
    expect(res.code).toBe(404)
    expect(state.db.deliveries[0]).toMatchObject({ status: 'assigned', driver_id: D1 })
    expect(events()).toHaveLength(0)
    // tampoco si la entrega quedó en una sede a la que ya no pertenece
    const far = seedDelivery({ location_id: OTHER_LOC })
    expect((await post(far, { status: 'picked_up' })).code).toBe(404)
  })

  it('aislamiento entre empresas y permisos', async () => {
    const foreign = seedDelivery({ tenant_id: OTHER_TENANT })
    expect((await post(foreign, { status: 'picked_up' })).code).toBe(404)
    const d = seedDelivery()
    expect((await post(d, { status: 'picked_up' }, authAs('cashier', randomUUID()))).code).toBe(403)
    expect((await post(d, { status: 'picked_up' }, authAs('seller', SELLER))).code).toBe(403)
    state.auth = authAs('admin', ADMIN)
    expect((await call(deliveryStatus, { body: { status: 'picked_up' } }, 'no-uuid')).code).toBe(404)
  })

  it('el administrador puede actualizar cualquier entrega de su punto, no de otro', async () => {
    const d = seedDelivery({ driver_id: D2 })
    expect((await post(d, { status: 'picked_up' }, authAs('admin', ADMIN))).code).toBe(200)
    const far = seedDelivery({ location_id: OTHER_LOC })
    expect((await post(far, { status: 'picked_up' }, authAs('admin', ADMIN))).code).toBe(403)
  })

  it('carrera: si otro cambió el estado entre la lectura y la escritura → 409', async () => {
    const d = seedDelivery()
    state.auth = authAs('driver', D1)
    // el operador marca recogida justo antes de que el conductor intente lo mismo con otro estado
    const realDb = state.db
    let reads = 0
    state.db = new Proxy(realDb, { get(t, p) { if (p === 'deliveries' && ++reads === 2) t.deliveries[0].status = 'delivery_failed'; return t[p] } })
    const res = await call(deliveryStatus, { body: { status: 'picked_up' } }, d.id)
    expect(res.code).toBe(409)
    state.db = realDb
    expect(events()).toHaveLength(0)
  })
})

// ---- Detalle del pedido ------------------------------
describe('detalle del pedido con historial logístico', () => {
  it('incluye las entregas (la más reciente primero) sin mezclar el estado comercial', async () => {
    const first = await assign(o, D1)
    state.db.deliveries.find(x => x.id === first.body.id).status = 'delivery_failed'
    await new Promise(r => setTimeout(r, 5))
    await assign(o, D2)
    const res = await call(ordersRequestGet, { query: {} }, o.id)
    expect(res.body.status).toBe('accepted')
    expect(res.body.deliveries.map(d => [d.status, d.driver.name])).toEqual([['assigned', 'Beatriz Soto'], ['delivery_failed', 'Carlos Ruiz']])
  })
})

// ---- Login por PIN del domiciliario ------------------
describe('POST /auth/login con rol driver', () => {
  const SLUG = 'la-chispa'
  beforeEach(() => {
    process.env.JWT_SECRET = 'secreto-de-prueba-para-jwt'
    state.db.tenants = [{ id: TENANT, name: 'La Chispa', slug: SLUG, active: true, license_start: '2020-01-01', license_end: '2099-12-31', has_inventory: false }]
    state.db.locations = [{ id: LOC, tenant_id: TENANT, name: 'Sede Centro', address: 'Cra 7', printer_config: {}, active: true }]
    // 'seller_locations.location_id' simula el filtro del join !inner de la consulta de login
    state.db.sellers.push(
      { id: randomUUID(), tenant_id: TENANT, name: 'Luis Domi', role: 'driver', pin: '4321', active: true, 'seller_locations.location_id': LOC },
      { id: randomUUID(), tenant_id: TENANT, name: 'Jefe', role: 'admin', pin: '9999', active: true, 'seller_locations.location_id': LOC },
      { id: randomUUID(), tenant_id: TENANT, name: 'Otra Sede', role: 'driver', pin: '1111', active: true, 'seller_locations.location_id': OTHER_LOC },
    )
  })
  const login = async (pin, location_id = LOC) => call(authLogin, { headers: {}, body: { pin, location_id, tenant_slug: SLUG } })

  it('acepta al domiciliario y el JWT lleva rol, empresa y punto', async () => {
    const res = await login('4321')
    expect(res.code).toBe(200)
    expect(res.body.seller).toMatchObject({ name: 'Luis Domi', role: 'driver' })
    const claims = await verifyJwt(res.body.token)
    expect(claims).toMatchObject({ role: 'driver', tenantId: TENANT, locationId: LOC, sellerId: res.body.seller.id })
  })

  it('no entra a un punto al que no está asignado, ni un admin por PIN', async () => {
    expect((await login('1111')).code).toBe(401)   // asignado a OTHER_LOC, intenta LOC
    expect((await login('9999')).code).toBe(401)   // admin/owner usan usuario y contraseña
    expect((await login('0000')).code).toBe(401)
  })

  it('un token de domiciliario es un token normal de usuario de empresa', async () => {
    const token = await signToken({ tenantId: TENANT, sellerId: D1, locationId: LOC, role: 'driver' })
    expect((await verifyJwt(token)).role).toBe('driver')
  })
})
