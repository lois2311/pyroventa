import { describe, it, expect, beforeEach, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { createFakeSupabase } from './fakeSupabase.js'
import { normalizePhone, canTransition, evaluateAcceptance, canVerifyPayment } from '../orderRules.js'
import { _resetForTests } from '../rateLimit.js'

// ---- Reglas puras ------------------------------------
describe('normalizePhone', () => {
  it('móviles colombianos → E.164', () => {
    expect(normalizePhone('300 123 4567')).toBe('+573001234567')
    expect(normalizePhone('573001234567')).toBe('+573001234567')
    expect(normalizePhone('+57 (300) 123-4567')).toBe('+573001234567')
  })
  it('rechaza basura, fijos sin indicativo y otros países sin +', () => {
    for (const bad of ['', 'abc', '12345', '6012345678', '5551234567', null, undefined]) expect(normalizePhone(bad)).toBeNull()
  })
  it('otro país solo con + explícito', () => {
    expect(normalizePhone('+1 415 555 0100')).toBe('+14155550100')
  })
})

describe('máquina de estados comercial', () => {
  it('accepted/rejected/cancelled no retroceden; rejected no se acepta', () => {
    expect(canTransition('submitted', 'accepted')).toBe(true)
    expect(canTransition('under_review', 'rejected')).toBe(true)
    expect(canTransition('rejected', 'accepted')).toBe(false)
    expect(canTransition('cancelled', 'accepted')).toBe(false)
    expect(canTransition('accepted', 'rejected')).toBe(false)
    expect(canTransition('accepted', 'ready_for_dispatch')).toBe(false) // el despacho es logística, no estado comercial
  })
})

describe('evaluateAcceptance', () => {
  const cod = { method: 'cash_on_delivery', status: 'pending' }
  const tr = (status) => ({ method: 'transfer', status })
  it('contraentrega siempre', () => expect(evaluateAcceptance(cod).ok).toBe(true))
  it('transferencia: solo verificada con la política por defecto', () => {
    expect(evaluateAcceptance(tr('pending')).ok).toBe(false)
    expect(evaluateAcceptance(tr('proof_submitted')).ok).toBe(false)
    expect(evaluateAcceptance(tr('manually_verified')).ok).toBe(true)
  })
  it('allow_pending_transfer acepta pendiente, pero nunca rechazada', () => {
    expect(evaluateAcceptance(tr('pending'), 'allow_pending_transfer').ok).toBe(true)
    expect(evaluateAcceptance(tr('rejected'), 'allow_pending_transfer').ok).toBe(false)
  })
  it('sin registro de pago no se acepta', () => expect(evaluateAcceptance(null).ok).toBe(false))
})

describe('canVerifyPayment', () => {
  it('solo transferencias, solo desde pending/proof_submitted; repetir es no-op', () => {
    expect(canVerifyPayment({ method: 'cash_on_delivery', status: 'pending' }, 'manually_verified').status).toBe(409)
    expect(canVerifyPayment({ method: 'transfer', status: 'pending' }, 'manually_verified').ok).toBe(true)
    expect(canVerifyPayment({ method: 'transfer', status: 'manually_verified' }, 'manually_verified').noop).toBe(true)
    expect(canVerifyPayment({ method: 'transfer', status: 'rejected' }, 'manually_verified').status).toBe(409)
    expect(canVerifyPayment({ method: 'transfer', status: 'pending' }, 'cualquiera').status).toBe(422)
  })
})

// ---- Handlers con BD en memoria ----------------------
const fake = vi.hoisted(() => ({ current: null, auth: null }))
vi.mock('../supabaseAdmin.js', () => ({ supabaseAdmin: { from: (...a) => fake.current.from(...a), rpc: (...a) => fake.current.rpc(...a) } }))
vi.mock('../auth.js', () => ({ requireCan: async () => fake.auth, requireAuth: async () => fake.auth }))

const routes = await import('../routes/ordersRoutes.js')

const TENANT = randomUUID()
const OTHER_TENANT = randomUUID()
const LOC = randomUUID()
const OTHER_LOC = randomUUID()
const P1 = randomUUID()
const P_OFF = randomUUID()

let db
const resetDb = () => {
  db = {
    order_settings: [{ tenant_id: TENANT, location_id: LOC, public_slug: 'piloto', enabled: true, currency: 'COP', quote_ttl_minutes: 15, payment_methods: ['cash_on_delivery', 'transfer'], accept_policy: 'require_verified' }],
    tenants: [{ id: TENANT, name: 'Pirotecnia SA', active: true, license_start: '2020-01-01', license_end: '2099-12-31' }],
    locations: [{ id: LOC, tenant_id: TENANT, name: 'Sede Centro', active: true }],
    products: [
      { id: 'prod1', tenant_id: TENANT, name: 'VOLCAN', active: true, description: null, image_url: null, category_id: null, categories: null,
        presentations: [{ id: P1, label: 'Unidad', price: 10000, active: true }, { id: P_OFF, label: 'Vieja', price: 1, active: false }] },
    ],
    location_products: [], location_prices: [],
    delivery_zones: [{ id: randomUUID(), tenant_id: TENANT, location_id: LOC, name: 'Centro', fee: 5000, active: true }],
    customers: [], customer_addresses: [], order_requests: [], order_request_items: [], payment_records: [],
  }
}

const TENANT_SCOPED = ['customers', 'customer_addresses', 'order_requests', 'order_request_items', 'payment_records']
const UNIQUE = {
  customers: (a, b) => a.tenant_id === b.tenant_id && a.phone === b.phone,
  order_requests: (a, b) => a.idempotency_key != null && a.tenant_id === b.tenant_id && a.idempotency_key === b.idempotency_key,
  payment_records: (a, b) => a.order_request_id === b.order_request_id,
}
const matches = (row, filters) => filters.every(([op, col, val]) => (op === 'eq' ? row[col] === val : op === 'in' ? val.includes(row[col]) : true))

function resolver(q) {
  const rows = db[q.table] || []
  const byToken = q.filters.some(f => f[1] === 'public_token')
  if (TENANT_SCOPED.includes(q.table)) {
    if (q.op === 'insert') {
      for (const p of [].concat(q.payload)) expect(p.tenant_id, `insert ${q.table} sin tenant_id`).toBeTruthy()
    } else if (!byToken) {
      expect(q.filters.some(f => f[0] === 'eq' && f[1] === 'tenant_id'), `${q.op} ${q.table} sin filtro tenant_id`).toBe(true)
    }
  }
  const out = (list) => { const copy = structuredClone(list); return { data: q.single ? (copy[0] ?? null) : copy, error: null } } // copias: como PostgREST, el handler no comparte referencias con la BD

  if (q.op === 'insert') {
    const created = []
    for (const p of [].concat(q.payload)) {
      const row = { id: randomUUID(), created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...p }
      if (q.table === 'order_requests') row.public_token = (randomUUID() + randomUUID()).replace(/-/g, '')
      if (UNIQUE[q.table] && rows.some(r => UNIQUE[q.table](row, r))) return { data: null, error: { code: '23505' } }
      rows.push(row); created.push(row)
    }
    return out(created)
  }
  if (q.op === 'update') {
    const hit = rows.filter(r => matches(r, q.filters))
    hit.forEach(r => Object.assign(r, q.payload))
    return out(hit)
  }
  if (q.op === 'delete') {
    db[q.table] = rows.filter(r => !matches(r, q.filters))
    return { data: null, error: null }
  }
  return out(rows.filter(r => matches(r, q.filters)))
}

const respond = () => {
  const r = { code: 200, body: undefined, headers: {} }
  r.status = (c) => { r.code = c; return r }
  r.json = (b) => { r.body = b; return r }
  r.setHeader = (k, v) => { r.headers[k] = v }
  return r
}
const IP = { 'x-forwarded-for': '1.2.3.4' }

const orderBody = (over = {}) => ({
  items: [{ presentation_id: P1, quantity: 2 }], expected_total: 25000, fulfillment: 'delivery',
  customer: { name: 'Ana Pérez', phone: '300 123 4567' }, address: { address: 'Calle 1 # 2-3', details: 'Apto 4' },
  payment_method: 'cash_on_delivery', consent: true, ...over,
})
const create = async (body = orderBody(), key = `key-${randomUUID()}`) => {
  const res = respond()
  await routes.publicRequestCreate({ headers: { ...IP, 'idempotency-key': key }, body }, res, 'piloto')
  return res
}
const adminReq = (over = {}) => ({ headers: { 'idempotency-key': `adm-${randomUUID()}` }, query: {}, body: {}, ...over })
const call = async (fn, req, ...args) => { const res = respond(); await fn(req, res, ...args); return res }

beforeEach(() => {
  _resetForTests()
  resetDb()
  fake.current = createFakeSupabase(resolver)
  fake.auth = { seller: { id: randomUUID(), name: 'Cajera', role: 'cashier' }, tenantId: TENANT, scope: { all: false, locationIds: [LOC] } }
})

describe('POST /public/orders/:slug/requests', () => {
  it('crea la solicitud con cotización del servidor, cliente E.164 y pago pendiente', async () => {
    const res = await create()
    expect(res.code).toBe(201)
    expect(res.body.public_token).toMatch(/^[a-f0-9]{64}$/)
    expect(res.body).toMatchObject({ status: 'submitted', subtotal: 20000, delivery_fee: 5000, total: 25000, payment: { method: 'cash_on_delivery', status: 'pending' } })
    expect(db.customers[0].phone).toBe('+573001234567')
    expect(db.order_requests[0].history[0]).toMatchObject({ action: 'created', actor: 'customer' })
    expect(db.order_request_items).toHaveLength(1)
    expect(db.order_request_items[0]).toMatchObject({ name: 'VOLCAN', label: 'Unidad', unit_price: 10000, quantity: 2, subtotal: 20000 })
    const json = JSON.stringify(res.body)
    for (const secret of [TENANT, LOC, db.order_requests[0].id, db.customers[0].id]) expect(json).not.toContain(secret)
  })

  it('misma Idempotency-Key devuelve el mismo pedido sin reinsertar', async () => {
    const first = await create(orderBody(), 'clave-repetida-1')
    const again = await create(orderBody(), 'clave-repetida-1')
    expect(first.code).toBe(201)
    expect(again.code).toBe(200)
    expect(again.body.public_token).toBe(first.body.public_token)
    expect(db.order_requests).toHaveLength(1)
    expect(db.order_request_items).toHaveLength(1)
    expect(db.payment_records).toHaveLength(1)
  })

  it('carrera: la clave ya existe al insertar (23505) → devuelve el existente', async () => {
    const first = await create(orderBody(), 'clave-carrera-1')
    // simula que findByKey previo no la vio: el insert choca con el índice único
    const realFrom = fake.current.from
    let hidden = true
    fake.current.from = (t) => {
      const chain = realFrom(t)
      if (t === 'order_requests' && hidden) { hidden = false; return { select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }) } }
      return chain
    }
    const again = await create(orderBody(), 'clave-carrera-1')
    expect(again.body.public_token).toBe(first.body.public_token)
    expect(db.order_requests).toHaveLength(1)
  })

  it('exige Idempotency-Key válida', async () => {
    const res = respond()
    await routes.publicRequestCreate({ headers: IP, body: orderBody() }, res, 'piloto')
    expect(res.code).toBe(400)
    expect(db.order_requests).toHaveLength(0)
  })

  it('producto/presentación inactiva → 422 y no se guarda nada', async () => {
    const res = await create(orderBody({ items: [{ presentation_id: P_OFF, quantity: 1 }], expected_total: 5001 }))
    expect(res.code).toBe(422)
    expect(db.order_requests).toHaveLength(0)
    expect(db.customers).toHaveLength(0)
  })

  it('precio manipulado: se ignora el precio del cliente; total esperado distinto → 409 sin guardar', async () => {
    const tampered = await create(orderBody({ items: [{ presentation_id: P1, quantity: 2, price: 1, custom_price: 1 }], expected_total: 3 }))
    expect(tampered.code).toBe(409)
    expect(tampered.body.quote.total).toBe(25000)
    expect(db.order_requests).toHaveLength(0)
    const ok = await create(orderBody({ items: [{ presentation_id: P1, quantity: 2, price: 1 }] }))
    expect(ok.code).toBe(201)
    expect(ok.body.total).toBe(25000)
  })

  it('valida total esperado, consentimiento, teléfono, dirección y método de pago', async () => {
    const cases = [
      orderBody({ expected_total: undefined }),
      orderBody({ consent: false }),
      orderBody({ customer: { name: 'Ana', phone: '123' } }),
      orderBody({ address: { address: 'x' } }),
      orderBody({ payment_method: 'bitcoin' }),
    ]
    for (const body of cases) expect((await create(body)).code).toBe(422)
    db.order_settings[0].payment_methods = ['cash_on_delivery']
    expect((await create(orderBody({ payment_method: 'transfer' }))).code).toBe(422)
    expect(db.order_requests).toHaveLength(0)
  })

  it('recogida en tienda no pide dirección ni cobra domicilio', async () => {
    const res = await create(orderBody({ fulfillment: 'pickup', address: undefined, expected_total: 20000 }))
    expect(res.code).toBe(201)
    expect(res.body.delivery_fee).toBe(0)
    expect(db.customer_addresses).toHaveLength(0)
  })

  it('reutiliza el cliente por teléfono dentro del tenant', async () => {
    await create(orderBody({ customer: { name: 'Ana', phone: '3001234567' } }))
    await create(orderBody({ customer: { name: 'Ana P.', phone: '+57 300 123 4567' } }))
    expect(db.customers).toHaveLength(1)
    expect(db.order_requests).toHaveLength(2)
  })

  it('slug desconocido → 404; más de 10 envíos/min por IP → 429', async () => {
    const res = respond()
    await routes.publicRequestCreate({ headers: { ...IP, 'idempotency-key': 'abcdefgh1' }, body: orderBody() }, res, 'nope')
    expect(res.code).toBe(404)
    for (let i = 0; i < 10; i++) await create(orderBody({ expected_total: 1 }))
    expect((await create()).code).toBe(429)
  })

  it('jamás toca facturas, caja ni inventario', async () => {
    await create()
    const tables = new Set(fake.current.calls.map(c => c.table).filter(Boolean))
    for (const forbidden of ['invoices', 'stock', 'stock_movements', 'register_closures', 'registers', 'price_audit_logs']) expect(tables.has(forbidden)).toBe(false)
    expect(fake.current.calls.some(c => c.rpc)).toBe(false)
  })
})

describe('GET /public/orders/requests/:token', () => {
  it('devuelve el estado por token opaco sin ids internos', async () => {
    const { body } = await create()
    const res = await call(routes.publicRequestGet, { headers: IP }, body.public_token)
    expect(res.code).toBe(200)
    expect(res.body).toMatchObject({ status: 'submitted', total: 25000 })
    expect(res.headers['Cache-Control']).toBe('no-store')
    expect(JSON.stringify(res.body)).not.toContain(TENANT)
  })
  it('token malformado o desconocido → 404', async () => {
    for (const t of ['x', 'g'.repeat(64), 'a'.repeat(64), undefined]) {
      expect((await call(routes.publicRequestGet, { headers: IP }, t)).code).toBe(404)
    }
  })
})

describe('administración: lista, detalle y alcance', () => {
  it('lista por sede y estado; fuera de alcance → 403', async () => {
    await create(); await create()
    db.order_requests[1].status = 'rejected'
    const all = await call(routes.ordersRequestsList, adminReq())
    expect(all.body).toHaveLength(2)
    expect(all.body[0].customer).toMatchObject({ name: 'Ana Pérez', phone: '+573001234567' })
    const filtered = await call(routes.ordersRequestsList, adminReq({ query: { location_id: LOC, status: 'rejected' } }))
    expect(filtered.body).toHaveLength(1)
    expect((await call(routes.ordersRequestsList, adminReq({ query: { location_id: OTHER_LOC } }))).code).toBe(403)
    expect((await call(routes.ordersRequestsList, adminReq({ query: { status: 'otro' } }))).code).toBe(422)
  })

  it('detalle con cliente, dirección, items, pago y línea de tiempo; sin idempotency_key', async () => {
    await create()
    const res = await call(routes.ordersRequestGet, adminReq(), db.order_requests[0].id)
    expect(res.code).toBe(200)
    expect(res.body.customer.phone).toBe('+573001234567')
    expect(res.body.address.address).toBe('Calle 1 # 2-3')
    expect(res.body.items).toHaveLength(1)
    expect(res.body.payment.method).toBe('cash_on_delivery')
    expect(res.body.timeline[0].action).toBe('created')
    expect(res.body).not.toHaveProperty('idempotency_key')
  })

  it('aislamiento: un pedido de otro tenant o sede ajena no se ve ni se modifica', async () => {
    await create()
    db.order_requests[0].tenant_id = OTHER_TENANT
    expect((await call(routes.ordersRequestGet, adminReq(), db.order_requests[0].id)).code).toBe(404)
    expect((await call(routes.ordersRequestAccept, adminReq(), db.order_requests[0].id)).code).toBe(404)
    db.order_requests[0].tenant_id = TENANT
    db.order_requests[0].location_id = OTHER_LOC
    expect((await call(routes.ordersRequestGet, adminReq(), db.order_requests[0].id)).code).toBe(403)
    expect((await call(routes.ordersRequestGet, adminReq(), 'no-es-uuid')).code).toBe(404)
  })
})

describe('aceptar / rechazar', () => {
  it('contraentrega: acepta, registra actor, y NO autoriza despacho ni crea factura', async () => {
    await create()
    const id = db.order_requests[0].id
    const res = await call(routes.ordersRequestAccept, adminReq(), id)
    expect(res.code).toBe(200)
    expect(res.body.status).toBe('accepted')
    const entry = db.order_requests[0].history.at(-1)
    expect(entry).toMatchObject({ action: 'accept', from: 'submitted', to: 'accepted', actor: { role: 'cashier' } })
    expect(res.body).not.toHaveProperty('delivery_status')
    expect(fake.current.calls.some(c => c.table === 'invoices')).toBe(false)
  })

  it('misma Idempotency-Key repetida no duplica la bitácora', async () => {
    await create()
    const id = db.order_requests[0].id
    const req = adminReq({ headers: { 'idempotency-key': 'accept-key-001' } })
    await call(routes.ordersRequestAccept, req, id)
    const again = await call(routes.ordersRequestAccept, req, id)
    expect(again.code).toBe(200)
    expect(db.order_requests[0].history.filter(h => h.action === 'accept')).toHaveLength(1)
  })

  it('exige Idempotency-Key', async () => {
    await create()
    const res = await call(routes.ordersRequestAccept, adminReq({ headers: {} }), db.order_requests[0].id)
    expect(res.code).toBe(400)
  })

  it('transición inválida: aceptar un pedido ya rechazado → 409; rechazar uno aceptado → 409', async () => {
    await create(); await create()
    const [a, b] = db.order_requests.map(o => o.id)
    expect((await call(routes.ordersRequestReject, adminReq({ body: { reason: 'Sin cobertura' } }), a)).code).toBe(200)
    expect((await call(routes.ordersRequestAccept, adminReq(), a)).code).toBe(409)
    expect((await call(routes.ordersRequestAccept, adminReq(), b)).code).toBe(200)
    expect((await call(routes.ordersRequestReject, adminReq({ body: { reason: 'Tarde' } }), b)).code).toBe(409)
  })

  it('rechazo exige motivo y lo guarda', async () => {
    await create()
    const id = db.order_requests[0].id
    expect((await call(routes.ordersRequestReject, adminReq({ body: {} }), id)).code).toBe(422)
    const ok = await call(routes.ordersRequestReject, adminReq({ body: { reason: 'Fuera de zona' } }), id)
    expect(ok.body).toMatchObject({ status: 'rejected', reject_reason: 'Fuera de zona' })
  })

  it('cambio concurrente: la guarda de estado devuelve 409', async () => {
    await create()
    const id = db.order_requests[0].id
    const realFrom = fake.current.from
    const mark = fake.current.calls.length
    fake.current.from = (t) => {
      // otro operador rechaza justo antes de nuestro update
      if (t === 'order_requests' && fake.current.calls.slice(mark).some(c => c.op === 'select' && c.table === 'order_requests')) db.order_requests[0].status = 'rejected'
      return realFrom(t)
    }
    const res = await call(routes.ordersRequestAccept, adminReq(), id)
    expect(res.code).toBe(409)
    expect(res.body.error).toMatch(/cambió mientras/) // falló la guarda del update, no la validación previa
  })

  it('transferencia sin verificar → 409; con verificación o política allow_pending_transfer → 200', async () => {
    await create(orderBody({ payment_method: 'transfer' })); await create(orderBody({ payment_method: 'transfer' }))
    const [a, b] = db.order_requests.map(o => o.id)
    const blocked = await call(routes.ordersRequestAccept, adminReq(), a)
    expect(blocked.code).toBe(409)
    expect(blocked.body.error).toMatch(/Verifica la transferencia/)

    expect((await call(routes.ordersPaymentVerify, adminReq({ body: { action: 'verify', reference: 'NEQ-123' } }), a)).code).toBe(200)
    expect((await call(routes.ordersRequestAccept, adminReq(), a)).code).toBe(200)

    db.order_settings[0].accept_policy = 'allow_pending_transfer'
    expect((await call(routes.ordersRequestAccept, adminReq(), b)).code).toBe(200)
  })

  it('transferencia rechazada nunca se acepta, ni con allow_pending_transfer', async () => {
    await create(orderBody({ payment_method: 'transfer' }))
    const id = db.order_requests[0].id
    await call(routes.ordersPaymentVerify, adminReq({ body: { action: 'reject' } }), id)
    db.order_settings[0].accept_policy = 'allow_pending_transfer'
    expect((await call(routes.ordersRequestAccept, adminReq(), id)).code).toBe(409)
  })
})

describe('verificación manual de pagos', () => {
  it('verifica una transferencia: estado, quién y cuándo; repetir es no-op', async () => {
    await create(orderBody({ payment_method: 'transfer' }))
    const id = db.order_requests[0].id
    const res = await call(routes.ordersPaymentVerify, adminReq({ body: { action: 'verify', reference: 'NEQ-9', proof_url: 'https://cdn.example.com/p.jpg' } }), id)
    expect(res.code).toBe(200)
    expect(res.body.payment).toMatchObject({ status: 'manually_verified', reference: 'NEQ-9', proof_url: 'https://cdn.example.com/p.jpg', verified_by: fake.auth.seller.id })
    expect(res.body.timeline.at(-1).action).toBe('payment_verified')
    const again = await call(routes.ordersPaymentVerify, adminReq({ body: { action: 'verify' } }), id)
    expect(again.code).toBe(200)
  })

  it('contraentrega no se verifica; acción inválida → 422; proof_url no https → 422; ya rechazada no se verifica', async () => {
    await create(); await create(orderBody({ payment_method: 'transfer' }))
    const [cod, tr] = db.order_requests.map(o => o.id)
    expect((await call(routes.ordersPaymentVerify, adminReq({ body: { action: 'verify' } }), cod)).code).toBe(409)
    expect((await call(routes.ordersPaymentVerify, adminReq({ body: { action: 'x' } }), tr)).code).toBe(422)
    expect((await call(routes.ordersPaymentVerify, adminReq({ body: { action: 'verify', proof_url: 'http://x.com/a.jpg' } }), tr)).code).toBe(422)
    await call(routes.ordersPaymentVerify, adminReq({ body: { action: 'reject' } }), tr)
    expect((await call(routes.ordersPaymentVerify, adminReq({ body: { action: 'verify' } }), tr)).code).toBe(409)
  })

  it('no se verifica el pago de un pedido rechazado', async () => {
    await create(orderBody({ payment_method: 'transfer' }))
    const id = db.order_requests[0].id
    await call(routes.ordersRequestReject, adminReq({ body: { reason: 'Sin stock real' } }), id)
    expect((await call(routes.ordersPaymentVerify, adminReq({ body: { action: 'verify' } }), id)).code).toBe(409)
  })
})
