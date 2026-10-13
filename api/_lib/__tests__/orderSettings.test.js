import { describe, it, expect, beforeEach, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { createFakeSupabase } from './fakeSupabase.js'
import { parseSettingsBody } from '../routes/orderSettingsRoutes.js'

const valid = (over = {}) => ({
  enabled: true, public_slug: 'Mi-Negocio', payment_methods: ['cash_on_delivery', 'transfer'], accept_policy: 'require_verified',
  quote_ttl_minutes: 15, business_hours: { days: ['mon', 'tue'], open: '08:00', close: '20:00' },
  transfer_details: { instructions: 'Bancolombia ahorros 123' }, delivery_fee: 5000, ...over,
})

describe('parseSettingsBody', () => {
  it('normaliza y acepta una configuración válida', () => {
    const { value } = parseSettingsBody(valid())
    expect(value.settings.public_slug).toBe('mi-negocio')
    expect(value.deliveryFee).toBe(5000)
  })
  it('rechaza lo inválido', () => {
    const bad = [
      valid({ enabled: 'si' }), valid({ public_slug: 'a' }), valid({ public_slug: '' }),
      valid({ payment_methods: [] }), valid({ payment_methods: ['bitcoin'] }),
      valid({ accept_policy: 'siempre' }), valid({ quote_ttl_minutes: 2 }), valid({ quote_ttl_minutes: 99 }),
      valid({ business_hours: { days: ['mon'], open: '20:00', close: '08:00' } }),
      valid({ business_hours: { days: ['xyz'], open: '08:00', close: '20:00' } }),
      valid({ transfer_details: { instructions: '' } }),
      valid({ delivery_fee: -1 }), valid({ delivery_fee: 'mucho' }),
    ]
    for (const b of bad) expect(parseSettingsBody(b).status, JSON.stringify(b)).toBe(422)
  })
  it('apagado no exige enlace; sin transferencia no exige instrucciones', () => {
    expect(parseSettingsBody(valid({ enabled: false, public_slug: '' })).value).toBeTruthy()
    expect(parseSettingsBody(valid({ payment_methods: ['cash_on_delivery'], transfer_details: {} })).value).toBeTruthy()
  })
})

// ---- Handlers ----------------------------------------
const fake = vi.hoisted(() => ({ current: null, auth: null }))
vi.mock('../supabaseAdmin.js', () => ({ supabaseAdmin: { from: (...a) => fake.current.from(...a) } }))
vi.mock('../auth.js', () => ({ requireCan: async () => fake.auth }))
const { ordersSettingsGet, ordersSettingsPut } = await import('../routes/orderSettingsRoutes.js')

const TENANT = randomUUID()
const LOC = randomUUID()
const OTHER_LOC = randomUUID()
let db
const matches = (r, fs) => fs.every(([op, c, v]) => (op === 'eq' ? r[c] === v : true))
const resolver = (q) => {
  const rows = db[q.table]
  if (q.table !== 'locations') {
    expect(q.op === 'insert' ? q.payload.tenant_id : q.filters.some(f => f[1] === 'tenant_id' && f[2] === TENANT), `${q.op} ${q.table} sin tenant`).toBeTruthy()
  }
  if (q.op === 'insert') {
    if (q.table === 'order_settings' && rows.some(r => r.public_slug && r.public_slug === q.payload.public_slug)) return { error: { code: '23505' } }
    rows.push({ id: randomUUID(), active: true, ...q.payload }); return { data: null, error: null }
  }
  if (q.op === 'update') { rows.filter(r => matches(r, q.filters)).forEach(r => Object.assign(r, q.payload)); return { data: null, error: null } }
  const hit = rows.filter(r => matches(r, q.filters))
  return { data: q.single ? (hit[0] ?? null) : hit, error: null }
}
const respond = () => { const r = { code: 200 }; r.status = (c) => { r.code = c; return r }; r.json = (b) => { r.body = b; return r }; return r }
const put = async (body, query = {}) => { const res = respond(); await ordersSettingsPut({ query, body }, res); return res }

beforeEach(() => {
  db = {
    order_settings: [], delivery_zones: [],
    locations: [{ id: LOC, tenant_id: TENANT, name: 'Sede Centro' }],
  }
  fake.current = createFakeSupabase(resolver)
  fake.auth = { tenantId: TENANT, seller: { id: randomUUID(), role: 'admin' }, scope: { all: false, locationIds: [LOC] } }
})

describe('GET/PUT /orders/settings', () => {
  it('sin configurar devuelve valores por defecto', async () => {
    const res = respond(); await ordersSettingsGet({ query: {} }, res)
    expect(res.body).toMatchObject({ configured: false, enabled: false, location_name: 'Sede Centro', accept_policy: 'require_verified', delivery_fee: null })
  })
  it('crea la configuración y la tarifa (una zona) y luego las actualiza', async () => {
    const first = await put(valid())
    expect(first.code).toBe(200)
    expect(first.body).toMatchObject({ configured: true, public_slug: 'mi-negocio', delivery_fee: 5000, zones_count: 1 })
    expect(db.order_settings[0]).toMatchObject({ tenant_id: TENANT, location_id: LOC })
    const second = await put(valid({ delivery_fee: 7000, accept_policy: 'allow_pending_transfer' }))
    expect(db.order_settings).toHaveLength(1)
    expect(db.delivery_zones).toHaveLength(1)
    expect(second.body).toMatchObject({ delivery_fee: 7000, accept_policy: 'allow_pending_transfer' })
  })
  it('enlace público repetido → 409', async () => {
    db.order_settings.push({ id: randomUUID(), tenant_id: randomUUID(), location_id: randomUUID(), public_slug: 'mi-negocio' })
    expect((await put(valid())).code).toBe(409)
  })
  it('con varias zonas activas no se edita la tarifa', async () => {
    db.delivery_zones.push(
      { id: randomUUID(), tenant_id: TENANT, location_id: LOC, fee: 1, active: true },
      { id: randomUUID(), tenant_id: TENANT, location_id: LOC, fee: 2, active: true })
    expect((await put(valid())).code).toBe(409)
    expect((await put(valid({ delivery_fee: null }))).code).toBe(200)
  })
  it('sede fuera de alcance → 403; validación → 422', async () => {
    expect((await put(valid(), { location_id: OTHER_LOC })).code).toBe(403)
    expect((await put(valid({ payment_methods: [] }))).code).toBe(422)
    expect(db.order_settings).toHaveLength(0)
  })
})
