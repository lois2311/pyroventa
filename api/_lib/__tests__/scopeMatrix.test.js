import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'
import { createFakeSupabase, filterValue } from './fakeSupabase.js'

const TENANT_ID = '00000000-0000-4000-8000-000000000001'
const NORTE = '11111111-1111-4111-8111-111111111111'
const SUR   = '22222222-2222-4222-8222-222222222222'
const REG_SUR = '33333333-3333-4333-8333-333333333333'
const INV_SUR = '44444444-4444-4444-8444-444444444444'

const USERS = {
  owner:       { id: 'u-owner', name: 'Laura',  role: 'owner',   active: true, seller_locations: [] },
  adminNorte:  { id: 'u-an',    name: 'Adm N',  role: 'admin',   active: true, seller_locations: [{ location_id: NORTE }] },
  cashierNorte:{ id: 'u-cn',    name: 'Caj N',  role: 'cashier', active: true, seller_locations: [{ location_id: NORTE }] },
  sellerNorte: { id: 'u-sn',    name: 'Ven N',  role: 'seller',  active: true, seller_locations: [{ location_id: NORTE }] },
}
const byId = Object.fromEntries(Object.values(USERS).map(u => [u.id, u]))

const TENANT = { id: TENANT_ID, name: 'Pyro', slug: 'pyro', active: true, license_start: '2026-01-01', license_end: '2099-12-31' }
const LOCATIONS = [{ id: NORTE, name: 'Norte', active: true }, { id: SUR, name: 'Sur', active: true }]

const fake = vi.hoisted(() => ({ current: null }))
// Objeto estable que delega al doble del test en curso (se recrea en beforeEach)
vi.mock('../supabaseAdmin.js', () => ({
  supabaseAdmin: {
    from: (...args) => fake.current.from(...args),
    rpc:  (...args) => fake.current.rpc(...args),
  },
}))

function resolver(q) {
  if (q.rpc) return { data: [], error: null }
  const id = filterValue(q, 'eq', 'id')
  const one = (row) => q.single
    ? { data: row ?? null, error: row ? null : { code: 'PGRST116', message: 'no rows' } }
    : { data: row ? [row] : [], error: null }

  switch (q.table) {
    case 'tenants': return one(TENANT)
    case 'sellers':
      if (q.op === 'select' && id) return one(byId[id])
      return { data: q.single ? null : [], error: null, count: 1 }
    case 'locations': {
      if (q.op !== 'select') return one({ id, name: 'x' })
      let rows = LOCATIONS
      const ins = q.filters.find(f => f[0] === 'in' && f[1] === 'id')
      if (ins) rows = rows.filter(l => ins[2].includes(l.id))
      if (id) return one(rows.find(l => l.id === id))
      return { data: rows, error: null }
    }
    case 'registers':
      if (id === REG_SUR) return one({ id: REG_SUR, name: 'Caja Sur', location_id: SUR })
      return one(null)
    case 'invoices':
      if (q.op === 'select' && id === INV_SUR) return one({ id: INV_SUR, location_id: SUR })
      return { data: q.single ? null : [], error: null, count: 0 }
    default:
      return { data: q.single ? null : [], error: null }
  }
}

let handler, signToken
beforeAll(async () => {
  process.env.JWT_SECRET = 'test-secret-matriz'
  ;({ signToken } = await import('../jwt.js'))
  handler = (await import('../../[[...path]].js')).default
})
beforeEach(() => { fake.current = createFakeSupabase(resolver) })

async function call(user, method, url, body) {
  const token = await signToken({ tenantId: TENANT_ID, sellerId: user.id, role: user.role })
  const [path, qs = ''] = url.split('?')
  const req = { method, url: path + (qs ? `?${qs}` : ''), headers: { authorization: `Bearer ${token}` },
    query: Object.fromEntries(new URLSearchParams(qs)), body }
  const res = {
    statusCode: 200, body: undefined, headersSent: false,
    setHeader() {}, status(c) { this.statusCode = c; return this },
    json(b) { this.body = b; this.headersSent = true; return this },
    end() { this.headersSent = true; return this },
  }
  await handler(req, res)
  return res
}

const DAY = 'from=2026-09-01&to=2026-09-01'
const rpcCalls = () => fake.current.calls.filter(c => c.rpc)

describe('admin Norte no ve ni toca Sur', () => {
  const a = USERS.adminNorte
  it.each([
    ['GET',  `/api/reports/daily?${DAY}&location_id=${SUR}`],
    ['GET',  `/api/reports/sellers?${DAY}&location_id=${SUR}`],
    ['GET',  `/api/reports/registers?${DAY}&location_id=${SUR}`],
    ['GET',  `/api/reports/top-products?${DAY}&location_id=${SUR}`],
    ['GET',  `/api/reports/seller-detail?${DAY}&seller_id=u-sn&location_id=${SUR}`],
    ['GET',  `/api/reports/register-detail?${DAY}&register_id=${REG_SUR}`],
    ['GET',  `/api/invoices/history?${DAY}&location_id=${SUR}`],
    ['GET',  `/api/invoices/pending?location_id=${SUR}`],
    ['GET',  `/api/closures?${DAY}&location_id=${SUR}`],
    ['GET',  `/api/sellers?location_id=${SUR}`],
    ['POST', `/api/invoices/1234/pay`, { location_id: SUR, pay_method: 'cash' }],
    ['POST', `/api/invoices/1234/cancel`, { location_id: SUR }],
    ['POST', `/api/invoices/${INV_SUR}/refund`, { reason: 'x' }],
    ['PUT',  `/api/registers/${REG_SUR}`, { name: 'hack' }],
    ['POST', `/api/registers`, { name: 'Caja 3', location_id: SUR }],
    ['PUT',  `/api/locations/${SUR}`, { printer_config: {} }],
  ])('%s %s → 403', async (method, url, body) => {
    const res = await call(a, method, url, body)
    expect(res.statusCode).toBe(403)
  })

  it('reporte sin location_id se fuerza a Norte (nunca consolidado)', async () => {
    const res = await call(a, 'GET', `/api/reports/daily?${DAY}`)
    expect(res.statusCode).toBe(200)
    const summary = rpcCalls().find(c => c.rpc === 'report_range_summary')
    expect(summary.params.p_location_id).toBe(NORTE)
    expect(rpcCalls().some(c => c.rpc === 'report_range_by_location')).toBe(false)
  })

  it('no accede al comparativo de puntos', async () => {
    expect((await call(a, 'GET', `/api/reports/locations?${DAY}`)).statusCode).toBe(403)
  })

  it('GET /locations solo devuelve Norte', async () => {
    const res = await call(a, 'GET', '/api/locations')
    expect(res.statusCode).toBe(200)
    expect(res.body.map(l => l.id)).toEqual([NORTE])
  })

  it('no crea superadmin ni admin', async () => {
    for (const role of ['owner', 'admin']) {
      const res = await call(a, 'POST', '/api/sellers', { name: 'X', role, username: 'nuevo.x', password: '1234567890', location_ids: [NORTE] })
      expect(res.statusCode).toBe(403)
    }
  })

  it('no edita catálogo ni puntos de venta', async () => {
    expect((await call(a, 'PUT', '/api/products/p1', { name: 'x' })).statusCode).toBe(403)
    expect((await call(a, 'POST', '/api/products/bulk', { products: [] })).statusCode).toBe(403)
    expect((await call(a, 'POST', '/api/locations', { name: 'Centro' })).statusCode).toBe(403)
    expect((await call(a, 'PUT', `/api/locations/${NORTE}`, { name: 'Renombrado' })).statusCode).toBe(403)
  })

  it('sí configura la impresora de su punto', async () => {
    expect((await call(a, 'PUT', `/api/locations/${NORTE}`, { printer_config: { paper_width: '58mm' } })).statusCode).toBe(200)
  })
})

describe('vendedor y cajero', () => {
  it('vendedor no cobra, no cancela, no ve reportes ni historial', async () => {
    const s = USERS.sellerNorte
    expect((await call(s, 'POST', '/api/invoices/1234/pay', { location_id: NORTE, pay_method: 'cash' })).statusCode).toBe(403)
    expect((await call(s, 'POST', '/api/invoices/1234/cancel', { location_id: NORTE })).statusCode).toBe(403)
    expect((await call(s, 'GET', `/api/reports/daily?${DAY}`)).statusCode).toBe(403)
    expect((await call(s, 'GET', `/api/invoices/history?${DAY}`)).statusCode).toBe(403)
    expect((await call(s, 'GET', '/api/sellers')).statusCode).toBe(403)
  })

  it('cajero no ve reportes', async () => {
    expect((await call(USERS.cashierNorte, 'GET', `/api/reports/daily?${DAY}`)).statusCode).toBe(403)
  })
})

describe('superadministrador', () => {
  const o = USERS.owner
  it('ve consolidado y comparativo', async () => {
    const res = await call(o, 'GET', `/api/reports/daily?${DAY}`)
    expect(res.statusCode).toBe(200)
    expect(rpcCalls().find(c => c.rpc === 'report_range_summary').params.p_location_id).toBeNull()
    expect(rpcCalls().some(c => c.rpc === 'report_range_by_location')).toBe(true)
    expect((await call(o, 'GET', `/api/reports/locations?${DAY}`)).statusCode).toBe(200)
  })

  it('consulta Sur', async () => {
    expect((await call(o, 'GET', `/api/reports/daily?${DAY}&location_id=${SUR}`)).statusCode).toBe(200)
  })

  it('no accede a puntos de otra empresa', async () => {
    const ajena = '99999999-9999-4999-8999-999999999999'
    expect((await call(o, 'GET', `/api/reports/daily?${DAY}&location_id=${ajena}`)).statusCode).toBe(403)
  })
})
