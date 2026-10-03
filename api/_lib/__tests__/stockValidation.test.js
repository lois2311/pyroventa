import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createFakeSupabase } from './fakeSupabase.js'

const TENANT = 't-1'
const LOC = 'l-1'
const P_TRACKED = 'p-tracked'
const P_SERVICE = 'p-service'

const fake = vi.hoisted(() => ({ current: null }))
vi.mock('../supabaseAdmin.js', () => ({
  supabaseAdmin: {
    from: (...a) => fake.current.from(...a),
    rpc:  (...a) => fake.current.rpc(...a),
  },
}))
vi.mock('../auth.js', () => ({
  requireAuth: async () => fake.auth,
  requireCan:  async () => fake.auth,
}))
vi.mock('../scopedLocation.js', () => ({
  scopedLocation: () => LOC,
  denyOutOfScope: () => false,
  loadScopedRegister: async () => null,
}))

const {
  isTracked, effectiveThreshold, stockFields,
  deductStockForInvoice, restoreStockForInvoice, findStockShortages, shortageMessage,
} = await import('../services/stockService.js')
const { invoicesPay } = await import('../routes/invoiceRoutes.js')

// Estado del "servidor" que cada test ajusta
let db
const resetDb = () => {
  db = {
    locationTracks: true,
    threshold: 5,
    products: [
      { id: P_TRACKED, track_stock: true,  min_stock: null },
      { id: P_SERVICE, track_stock: false, min_stock: null },
    ],
    stock: [{ product_id: P_TRACKED, quantity: 1 }, { product_id: P_SERVICE, quantity: 0 }],
    productsError: null,
    pendingItems: [],
  }
}

function resolver(q) {
  if (q.rpc) return { data: 0, error: null }
  const ok = (data) => ({ data, error: null })
  switch (q.table) {
    case 'tenants':   return ok({ low_stock_threshold: db.threshold })
    case 'locations': return ok({ tracks_inventory: db.locationTracks })
    case 'products':
      if (db.productsError) return { data: null, error: db.productsError }
      return ok(db.products)
    case 'stock': return ok(db.stock)
    case 'invoices':
      if (q.op === 'update') return ok({ id: 'inv-1', items: db.pendingItems, location_id: LOC, status: 'paid' })
      return ok({ items: db.pendingItems })
    default: return ok(null)
  }
}

const items = (...rows) => rows.map(([productId, qty, name]) => ({ productId, qty, product_name: name || productId }))
const rpcCalls = () => fake.current.calls.filter(c => c.rpc === 'apply_stock_delta')

beforeEach(() => {
  resetDb()
  fake.current = createFakeSupabase(resolver)
  fake.auth = {
    tenantId: TENANT, tenant: { has_inventory: true },
    seller: { id: 'u-1', name: 'Caja' },
  }
})

describe('reglas puras', () => {
  it('isTracked exige inventario del negocio, del punto y del producto', () => {
    const on = { has_inventory: true }
    expect(isTracked(on, { tracks_inventory: true }, { track_stock: true })).toBe(true)
    expect(isTracked({ has_inventory: false }, null, null)).toBe(false)
    expect(isTracked(on, { tracks_inventory: false }, { track_stock: true })).toBe(false)
    expect(isTracked(on, { tracks_inventory: true }, { track_stock: false })).toBe(false)
  })

  it('un punto sin inventario controla solo los productos con excepción', () => {
    const on = { has_inventory: true }
    const off = { tracks_inventory: false }
    expect(isTracked(on, off, { track_stock: true })).toBe(false)
    expect(isTracked(on, off, { track_stock: true, location_track: true })).toBe(true)
    expect(isTracked(on, off, { track_stock: true, location_track: null })).toBe(false)
  })

  it('un punto con inventario puede excluir productos concretos', () => {
    const on = { has_inventory: true }
    expect(isTracked(on, { tracks_inventory: true }, { track_stock: true, location_track: false })).toBe(false)
  })

  it('la excepción del punto no revive un producto sin seguimiento ni salta el interruptor del negocio', () => {
    expect(isTracked({ has_inventory: true }, { tracks_inventory: false }, { track_stock: false, location_track: true })).toBe(false)
    expect(isTracked({ has_inventory: false }, { tracks_inventory: false }, { track_stock: true, location_track: true })).toBe(false)
  })

  it('campos ausentes (BD sin migrar) cuentan como controlado', () => {
    expect(isTracked({ has_inventory: true }, null, undefined)).toBe(true)
  })

  it('el umbral del producto gana al del negocio', () => {
    expect(effectiveThreshold({ min_stock: 2 }, 10)).toBe(2)
    expect(effectiveThreshold({ min_stock: null }, 10)).toBe(10)
    expect(effectiveThreshold(undefined)).toBe(5)
  })

  it('stockFields calcula bajo/agotado con el umbral efectivo', () => {
    const ctx = { tenant: { has_inventory: true }, location: null, threshold: 5 }
    expect(stockFields({ min_stock: 2 }, 3, ctx)).toMatchObject({ is_low_stock: false, is_out_of_stock: false, low_stock_threshold: 2 })
    expect(stockFields({}, 3, ctx)).toMatchObject({ is_low_stock: true, stock_tracked: true })
    expect(stockFields({}, 0, ctx)).toMatchObject({ is_low_stock: false, is_out_of_stock: true })
    expect(stockFields({ track_stock: false }, 0, ctx)).toMatchObject({ stock_tracked: false, is_out_of_stock: false, is_low_stock: false })
  })
})

describe('deductStockForInvoice / restoreStockForInvoice', () => {
  it('descuenta con apply_stock_delta (delta negativo) los productos controlados', async () => {
    const r = await deductStockForInvoice(TENANT, 'inv-1', LOC, items([P_TRACKED, 3]), 'u-1')
    expect(r).toMatchObject({ ok: true, deducted: 1 })
    expect(rpcCalls()).toHaveLength(1)
    expect(rpcCalls()[0].params).toMatchObject({
      p_tenant_id: TENANT, p_location_id: LOC, p_product_id: P_TRACKED,
      p_delta: -3, p_reason: 'sale', p_invoice_id: 'inv-1', p_allow_negative: true,
    })
  })

  it('un producto sin control no descuenta stock', async () => {
    const r = await deductStockForInvoice(TENANT, 'inv-1', LOC, items([P_SERVICE, 4]))
    expect(r).toMatchObject({ ok: true, deducted: 0 })
    expect(rpcCalls()).toHaveLength(0)
  })

  it('mezcla: solo descuenta el controlado', async () => {
    await deductStockForInvoice(TENANT, 'inv-1', LOC, items([P_SERVICE, 4], [P_TRACKED, 1]))
    expect(rpcCalls().map(c => c.params.p_product_id)).toEqual([P_TRACKED])
  })

  it('un punto sin inventario omite todo el descuento', async () => {
    db.locationTracks = false
    const r = await deductStockForInvoice(TENANT, 'inv-1', LOC, items([P_TRACKED, 3]))
    expect(r.deducted).toBe(0)
    expect(rpcCalls()).toHaveLength(0)
  })

  it('una venta offline sincronizada deja la nota de auditoría', async () => {
    await deductStockForInvoice(TENANT, 'inv-1', LOC, items([P_TRACKED, 3]), 'u-1', { offline: true })
    expect(rpcCalls()[0].params.p_notes).toBe('Venta offline sincronizada')
  })

  it('sin las columnas nuevas (BD sin migrar) todo se trata como controlado', async () => {
    db.productsError = { code: '42703', message: 'column products.track_stock does not exist' }
    await deductStockForInvoice(TENANT, 'inv-1', LOC, items([P_SERVICE, 1]))
    expect(rpcCalls()).toHaveLength(1)
  })

  it('reporta el fallo del RPC en lugar de tragárselo', async () => {
    fake.current = createFakeSupabase(q => (q.rpc ? { data: null, error: { message: 'boom' } } : resolver(q)))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const r = await deductStockForInvoice(TENANT, 'inv-1', LOC, items([P_TRACKED, 1]))
    expect(r.ok).toBe(false)
    expect(r.failures).toHaveLength(1)
  })

  it('la devolución reintegra con delta positivo solo lo controlado', async () => {
    const r = await restoreStockForInvoice(TENANT, 'inv-1', LOC, items([P_TRACKED, 2], [P_SERVICE, 5]), 'u-1')
    expect(r).toMatchObject({ ok: true, restored: 1 })
    expect(rpcCalls()).toHaveLength(1)
    expect(rpcCalls()[0].params).toMatchObject({ p_delta: 2, p_reason: 'refund', p_product_id: P_TRACKED })
  })
})

describe('findStockShortages', () => {
  it('detecta lo que no alcanza y ignora lo no controlado', async () => {
    const s = await findStockShortages(TENANT, LOC, items([P_TRACKED, 3, 'Volcán'], [P_SERVICE, 99]))
    expect(s).toEqual([{ productId: P_TRACKED, productName: 'Volcán', available: 1 }])
    expect(shortageMessage(s[0])).toBe('Sin existencia. Quedan 1 de Volcán.')
  })

  it('sin faltantes devuelve lista vacía', async () => {
    expect(await findStockShortages(TENANT, LOC, items([P_TRACKED, 1]))).toEqual([])
  })
})

describe('invoicesPay', () => {
  const run = async (body = {}) => {
    const res = { code: 200, body: null, setHeader() {}, status(c) { this.code = c; return this }, json(b) { this.body = b; return this } }
    await invoicesPay({ body: { pay_method: 'cash', ...body }, query: {} }, res, 'ABC123')
    return res
  }
  const paid = () => fake.current.calls.some(c => c.table === 'invoices' && c.op === 'update')

  it('rechaza con 409 si un producto controlado no alcanza y no cobra', async () => {
    db.pendingItems = items([P_TRACKED, 3, 'Volcán'])
    const res = await run()
    expect(res.code).toBe(409)
    expect(res.body.error).toBe('Sin existencia. Quedan 1 de Volcán.')
    expect(paid()).toBe(false)
    expect(rpcCalls()).toHaveLength(0)
  })

  it('cobra y descuenta cuando alcanza', async () => {
    db.pendingItems = items([P_TRACKED, 1])
    const res = await run()
    expect(res.code).toBe(200)
    expect(rpcCalls()).toHaveLength(1)
  })

  it('un producto sin control se cobra sin importar el stock y sin descontar', async () => {
    db.pendingItems = items([P_SERVICE, 50])
    const res = await run()
    expect(res.code).toBe(200)
    expect(rpcCalls()).toHaveLength(0)
  })

  it('una venta offline sincronizada se acepta aunque el saldo quede negativo', async () => {
    db.pendingItems = items([P_TRACKED, 3, 'Volcán'])
    const res = await run({ offline_sync: true })
    expect(res.code).toBe(200)
    expect(rpcCalls()[0].params).toMatchObject({ p_delta: -3, p_notes: 'Venta offline sincronizada' })
  })

  it('un negocio sin inventario no valida ni descuenta', async () => {
    fake.auth.tenant = { has_inventory: false }
    db.pendingItems = items([P_TRACKED, 3])
    const res = await run()
    expect(res.code).toBe(200)
    expect(rpcCalls()).toHaveLength(0)
  })

  it('avisa si el cobro quedó pero el inventario no se pudo actualizar', async () => {
    db.pendingItems = items([P_TRACKED, 1])
    fake.current = createFakeSupabase(q => (q.rpc ? { data: null, error: { message: 'boom' } } : resolver(q)))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await run()
    expect(res.code).toBe(200)
    expect(res.body.stock_warning).toMatch(/inventario no se actualiz/)
  })
})
