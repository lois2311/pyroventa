import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createFakeSupabase } from './fakeSupabase.js'
import { hit, _resetForTests } from '../rateLimit.js'
import { buildQuote, parseQuoteRequest, resolveDeliveryFee, isQuoteExpired, DEFAULT_TTL_MINUTES } from '../services/quoteService.js'

const catalog = new Map([
  ['p1', { label: 'Unidad', price: 10000, product_id: 'prod1', product_name: 'VOLCAN' }],
  ['p2', { label: 'Caja',   price: 4500,  product_id: 'prod2', product_name: 'BENGALA' }],
])
const NOW = new Date('2026-10-12T15:00:00.000Z')
const base = { catalog, fulfillment: 'delivery', now: NOW }
const line = (id, qty) => ({ presentationId: id, qty })

describe('buildQuote — el precio lo pone el servidor', () => {
  it('calcula subtotal, tarifa y total', () => {
    const { quote } = buildQuote({ ...base, lines: [line('p1', 2), line('p2', 1)], zones: [{ id: 'z1', name: 'Centro', fee: 5000 }] })
    expect(quote.subtotal).toBe(24500)
    expect(quote.delivery_fee).toBe(5000)
    expect(quote.total).toBe(29500)
    expect(quote.items[0]).toMatchObject({ presentation_id: 'p1', quantity: 2, unit_price: 10000, subtotal: 20000 })
  })

  it('ignora un precio enviado por el cliente', () => {
    const parsed = parseQuoteRequest({ items: [{ presentation_id: 'p1', quantity: 1, price: 1, custom_price: 1 }] })
    const { quote } = buildQuote({ ...base, lines: parsed.value.lines })
    expect(quote.items[0].unit_price).toBe(10000)
  })

  it('rechaza un producto que no está en el catálogo vendible (inactivo, ajeno o borrado)', () => {
    const r = buildQuote({ ...base, lines: [line('inactivo', 1)] })
    expect(r.status).toBe(422)
    expect(r.error).toMatch(/ya no está disponible/)
  })

  it('rechaza si el total esperado no coincide y devuelve la cotización nueva', () => {
    const r = buildQuote({ ...base, lines: [line('p1', 1)], expectedTotal: 9000 })
    expect(r.status).toBe(409)
    expect(r.quote.total).toBe(10000)
  })

  it('acepta si el total esperado coincide', () => {
    expect(buildQuote({ ...base, lines: [line('p1', 1)], expectedTotal: 10000 }).quote.total).toBe(10000)
  })
})

describe('vigencia de la cotización', () => {
  it('expira a los 15 minutos por defecto, en ISO-8601', () => {
    const { quote } = buildQuote({ ...base, lines: [line('p1', 1)] })
    expect(DEFAULT_TTL_MINUTES).toBe(15)
    expect(quote.quoted_at).toBe('2026-10-12T15:00:00.000Z')
    expect(quote.expires_at).toBe('2026-10-12T15:15:00.000Z')
  })
  it('respeta el ttl configurado', () => {
    const { quote } = buildQuote({ ...base, lines: [line('p1', 1)], ttlMinutes: 5 })
    expect(quote.expires_at).toBe('2026-10-12T15:05:00.000Z')
  })
  it('isQuoteExpired: vigente antes, vencida en el límite y después', () => {
    const exp = '2026-10-12T15:15:00.000Z'
    expect(isQuoteExpired(exp, new Date('2026-10-12T15:14:59.999Z'))).toBe(false)
    expect(isQuoteExpired(exp, new Date('2026-10-12T15:15:00.000Z'))).toBe(true)
    expect(isQuoteExpired(exp, new Date('2026-10-12T16:00:00.000Z'))).toBe(true)
  })
})

describe('tarifa de domicilio', () => {
  const z1 = { id: 'z1', name: 'Centro', fee: 5000 }
  const z2 = { id: 'z2', name: 'Norte', fee: 8000 }
  it('recogida en tienda no cobra domicilio', () => {
    expect(resolveDeliveryFee([z1, z2], { fulfillment: 'pickup' }).fee).toBe(0)
  })
  it('una sola zona activa = tarifa fija', () => {
    expect(resolveDeliveryFee([z1], { fulfillment: 'delivery' }).fee).toBe(5000)
  })
  it('sin zonas configuradas, 0', () => {
    expect(resolveDeliveryFee([], { fulfillment: 'delivery' }).fee).toBe(0)
  })
  it('varias zonas exigen elegir; zona ajena o inactiva se rechaza', () => {
    expect(resolveDeliveryFee([z1, z2], { fulfillment: 'delivery' }).status).toBe(422)
    expect(resolveDeliveryFee([z1, z2], { fulfillment: 'delivery', zoneId: 'z2' }).fee).toBe(8000)
    expect(resolveDeliveryFee([z1, z2], { fulfillment: 'delivery', zoneId: 'otra' }).status).toBe(422)
  })
})

describe('parseQuoteRequest', () => {
  it('rechaza sin productos, con demasiadas líneas o fulfillment raro', () => {
    expect(parseQuoteRequest({}).status).toBe(422)
    expect(parseQuoteRequest({ items: [] }).status).toBe(422)
    expect(parseQuoteRequest({ items: Array(51).fill({ presentation_id: 'p1', quantity: 1 }) }).status).toBe(422)
    expect(parseQuoteRequest({ items: [{ presentation_id: 'p1', quantity: 1 }], fulfillment: 'dron' }).status).toBe(422)
  })
})

// ---- Handlers públicos con BD simulada ---------------
const fake = vi.hoisted(() => ({ current: null }))
vi.mock('../supabaseAdmin.js', () => ({ supabaseAdmin: { from: (...a) => fake.current.from(...a), rpc: () => {} } }))
const { publicCatalogGet, publicQuotePost } = await import('../routes/ordersRoutes.js')

const REQ = { headers: { 'x-forwarded-for': '1.2.3.4' } }
const TENANT = 't-1'
const LOC = 'l-1'
let db
const resetDb = () => {
  db = {
    settings: { tenant_id: TENANT, location_id: LOC, currency: 'COP', quote_ttl_minutes: 15 },
    tenant: { id: TENANT, name: 'Pirotecnia SA', active: true, license_start: '2020-01-01', license_end: '2099-12-31' },
    location: { id: LOC, name: 'Sede Centro', active: true },
    products: [
      { id: 'prod1', name: 'VOLCAN', description: null, image_url: 'u.jpg', category_id: 'c1', categories: { id: 'c1', name: 'Fuentes', icon: null, sort_order: 1 },
        presentations: [{ id: 'p1', label: 'Unidad', price: 10000, active: true }, { id: 'p1x', label: 'Vieja', price: 1, active: false }] },
      { id: 'prod2', name: 'OCULTO EN SEDE', description: null, image_url: null, category_id: null, categories: null,
        presentations: [{ id: 'p2', label: 'Unidad', price: 500, active: true }] },
    ],
    locProds: [{ product_id: 'prod2', active: false }],
    locPrices: [{ presentation_id: 'p1', price: 12000 }],
    zones: [{ id: 'z1', name: 'Centro', fee: 5000 }],
  }
}
const respond = () => {
  const r = { code: 200, body: undefined, headers: {} }
  r.status = (c) => { r.code = c; return r }
  r.json = (b) => { r.body = b; return r }
  r.setHeader = (k, v) => { r.headers[k] = v }
  return r
}

beforeEach(() => {
  _resetForTests()
  resetDb()
  fake.current = createFakeSupabase((q) => {
    const rows = {
      order_settings: db.settings, tenants: db.tenant, locations: db.location,
      products: db.products, location_products: db.locProds, location_prices: db.locPrices, delivery_zones: db.zones,
    }[q.table]
    // Toda consulta de datos de negocio debe ir acotada al tenant
    if (!['order_settings', 'tenants'].includes(q.table)) {
      expect(q.filters.some(f => f[0] === 'eq' && f[1] === 'tenant_id' && f[2] === TENANT), `tabla ${q.table} sin tenant_id`).toBe(true)
    }
    if (q.table === 'order_settings' && !q.filters.some(f => f[1] === 'public_slug' && f[2] === 'piloto')) return { data: null, error: null }
    return { data: rows, error: null }
  })
})

describe('GET /public/orders/:slug/catalog', () => {
  it('devuelve solo lo vendible, con precio de sede y sin ids de tenant', async () => {
    const res = respond()
    await publicCatalogGet(REQ, res, 'piloto')
    expect(res.code).toBe(200)
    expect(res.body.products.map(p => p.id)).toEqual(['prod1'])       // prod2 deshabilitado en la sede
    expect(res.body.products[0].presentations).toEqual([{ id: 'p1', label: 'Unidad', price: 12000 }]) // sin la inactiva
    expect(res.body.delivery_zones).toEqual([{ id: 'z1', name: 'Centro', fee: 5000 }])
    expect(JSON.stringify(res.body)).not.toContain(TENANT)
    expect(JSON.stringify(res.body)).not.toContain(LOC)
  })
  it('slug desconocido o inválido → 404', async () => {
    for (const slug of ['nope', '../x', undefined]) {
      const res = respond()
      await publicCatalogGet(REQ, res, slug)
      expect(res.code).toBe(404)
    }
  })
  it('licencia vencida → 404', async () => {
    db.tenant.license_end = '2020-01-02'
    const res = respond()
    await publicCatalogGet(REQ, res, 'piloto')
    expect(res.code).toBe(404)
  })
})

describe('POST /public/orders/:slug/quote', () => {
  it('cotiza con el precio de la sede + tarifa y no persiste nada', async () => {
    const res = respond()
    await publicQuotePost({ headers: {}, body: { items: [{ presentation_id: 'p1', quantity: 2 }] } }, res, 'piloto')
    expect(res.code).toBe(200)
    expect(res.body).toMatchObject({ subtotal: 24000, delivery_fee: 5000, total: 29000 })
    expect(fake.current.calls.every(c => c.op === 'select')).toBe(true)
  })
  it('producto deshabilitado en la sede o presentación inactiva → 422', async () => {
    for (const id of ['p2', 'p1x']) {
      const res = respond()
      await publicQuotePost({ headers: {}, body: { items: [{ presentation_id: id, quantity: 1 }] } }, res, 'piloto')
      expect(res.code).toBe(422)
    }
  })
  it('total esperado desactualizado → 409 con la cotización nueva', async () => {
    const res = respond()
    await publicQuotePost({ headers: {}, body: { items: [{ presentation_id: 'p1', quantity: 1 }], expected_total: 15000 } }, res, 'piloto')
    expect(res.code).toBe(409)
    expect(res.body.quote.total).toBe(17000)
  })
})

describe('rate limit de rutas públicas', () => {
  it('hit: permite hasta el máximo y luego bloquea; la ventana se reinicia', () => {
    const o = { max: 3, windowMs: 1000, now: 0 }
    expect([1, 2, 3].every(() => hit('k', o).ok)).toBe(true)
    const blocked = hit('k', o)
    expect(blocked.ok).toBe(false)
    expect(blocked.retryAfter).toBe(1)
    expect(hit('k', { ...o, now: 1000 }).ok).toBe(true)
    expect(hit('otra', o).ok).toBe(true) // claves independientes
  })
  it('catálogo y cotización responden 429 con Retry-After tras 60 req/min por IP', async () => {
    for (let i = 0; i < 60; i++) await publicCatalogGet(REQ, respond(), 'piloto')
    const res = respond()
    await publicQuotePost({ ...REQ, body: { items: [{ presentation_id: 'p1', quantity: 1 }] } }, res, 'piloto')
    expect(res.code).toBe(429)
    expect(res.headers['Retry-After']).toBeDefined()
    const other = respond()
    await publicCatalogGet({ headers: { 'x-forwarded-for': '9.9.9.9' } }, other, 'piloto')
    expect(other.code).toBe(200)
  })
})
