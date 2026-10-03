import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createFakeSupabase, filterValue } from './fakeSupabase.js'

const TENANT = 't-1'
const LOC = 'l-1'
const OTHER_LOC = 'l-2'
const P1 = 'p-1'
const P2 = 'p-2'

const fake = vi.hoisted(() => ({ current: null, auth: null }))
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

const {
  adjustStock, initProductStock, receiveStock, wasteStock,
  validateReceiveItems, validateWaste, movementFlag,
} = await import('../services/stockService.js')
const { inventoryReceivePost, inventoryWastePost, inventoryMovementsGet } = await import('../routes/inventoryRoutes.js')

// "Servidor" mínimo: saldo por producto y reglas de apply_stock_delta
let stock
let tracked
const resolver = (q) => {
  if (q.rpc === 'apply_stock_delta') {
    const p = q.params
    const cur = stock[p.p_product_id] ?? 0
    const next = cur + p.p_delta
    if (next < 0 && !p.p_allow_negative) return { data: null, error: { message: 'INSUFFICIENT_STOCK' } }
    stock[p.p_product_id] = next
    return { data: next, error: null }
  }
  switch (q.table) {
    case 'stock': return { data: stock[P1] === undefined ? null : { quantity: stock[P1] }, error: null }
    case 'products': {
      const inF = q.filters.find(f => f[0] === 'in')
      const all = [{ id: P1, name: 'Volcán' }, { id: P2, name: 'Cohete' }]
      return { data: all.filter(p => !inF || inF[2].includes(p.id)).map(p => ({ ...p, track_stock: tracked.includes(p.id), min_stock: null })), error: null }
    }
    case 'tenants':   return { data: { low_stock_threshold: 5 }, error: null }
    case 'locations': return { data: { tracks_inventory: true }, error: null }
    case 'stock_movements': return { data: [], error: null }
    default: return { data: null, error: null }
  }
}

const rpcCalls = () => fake.current.calls.filter(c => c.rpc === 'apply_stock_delta')

function mockRes() {
  const res = { statusCode: 200, body: null }
  res.status = (c) => { res.statusCode = c; return res }
  res.json = (b) => { res.body = b; return res }
  return res
}

beforeEach(() => {
  stock = { [P1]: 10 }
  tracked = [P1, P2]
  fake.current = createFakeSupabase(resolver)
  fake.auth = {
    tenantId: TENANT, tenant: { has_inventory: true },
    seller: { id: 'u-1', name: 'Ana', role: 'admin' },
    scope: { all: false, locationIds: [LOC] },
  }
})

describe('escritura de stock: todo pasa por apply_stock_delta', () => {
  it('adjustStock aplica el delta sin lanzar TypeError ni escribir tablas directamente', async () => {
    const r = await adjustStock(TENANT, LOC, P1, 25, 'manual_adjustment', 'u-1', 'Conteo')
    expect(r).toMatchObject({ ok: true, delta: 15, quantity: 25 })
    const [call] = rpcCalls()
    expect(call.params).toMatchObject({ p_delta: 15, p_reason: 'manual_adjustment', p_user_id: 'u-1', p_notes: 'Conteo' })
    const direct = fake.current.calls.filter(c => c.table === 'stock_movements' || (c.table === 'stock' && c.op !== 'select'))
    expect(direct).toEqual([])
  })

  it('adjustStock acepta motivos nuevos (damage, transfer) sin error', async () => {
    await expect(adjustStock(TENANT, LOC, P1, 4, 'damage', 'u-1', 'Mojado')).resolves.toMatchObject({ delta: -6 })
    await expect(adjustStock(TENANT, LOC, P1, 3, 'transfer', 'u-1')).resolves.toMatchObject({ delta: -1 })
  })

  it('adjustStock sin cambio no registra movimiento', async () => {
    await adjustStock(TENANT, LOC, P1, 10)
    expect(rpcCalls()).toHaveLength(0)
  })

  it('si la función falla, adjustStock lanza un error claro (no un TypeError)', async () => {
    fake.current = createFakeSupabase(() => ({ data: null, error: { message: 'boom' } }))
    await expect(adjustStock(TENANT, LOC, P1, 5)).rejects.toThrow('boom')
  })

  it('initProductStock registra initial_load por cada punto', async () => {
    // Producto nuevo: ningún punto tiene saldo todavía
    fake.current = createFakeSupabase((q) => {
      if (q.table === 'locations') return { data: [{ id: LOC }, { id: OTHER_LOC }], error: null }
      if (q.table === 'stock') return { data: null, error: null }
      return resolver(q)
    })
    stock = {}
    const r = await initProductStock(TENANT, P1, 7, null, 'u-1')
    expect(r).toMatchObject({ ok: true, locations: 2 })
    expect(rpcCalls().map(c => [c.params.p_location_id, c.params.p_delta, c.params.p_reason]))
      .toEqual([[LOC, 7, 'initial_load'], [OTHER_LOC, 7, 'initial_load']])
  })
})

describe('receiveStock (+N atómico)', () => {
  it('suma sobre el saldo existente y comparte lote, usuario y referencia', async () => {
    stock = { [P1]: 10, [P2]: 0 }
    const v = validateReceiveItems([
      { product_id: P1, quantity: 5 },
      { product_id: P2, quantity: 20, notes: 'Caja dañada' },
    ], { reference: 'FAC-123' })
    const r = await receiveStock(TENANT, LOC, v.items, { userId: 'u-1' })
    expect(r.applied).toEqual([
      { productId: P1, before: 10, after: 15 },
      { productId: P2, before: 0, after: 20 },
    ])
    expect(stock).toEqual({ [P1]: 15, [P2]: 20 })
    const calls = rpcCalls().map(c => c.params)
    expect(calls.every(p => p.p_reason === 'restock' && p.p_user_id === 'u-1' && p.p_reference === 'FAC-123')).toBe(true)
    expect(new Set(calls.map(p => p.p_batch_id)).size).toBe(1)
    expect(calls[0].p_batch_id).toBe(r.batchId)
  })

  it('una venta concurrente no se pierde: la reposición suma al saldo vigente', async () => {
    const v = validateReceiveItems([{ product_id: P1, quantity: 10 }])
    stock[P1] -= 4 // se vendieron 4 mientras el admin escribía
    const r = await receiveStock(TENANT, LOC, v.items)
    expect(r.applied[0].after).toBe(16) // 10 - 4 + 10, no 20
  })

  it('reporta fallos por línea sin abortar las demás', async () => {
    fake.current = createFakeSupabase((q) => (q.rpc && q.params.p_product_id === P1
      ? { data: null, error: { message: 'x' } } : resolver(q)))
    const v = validateReceiveItems([{ product_id: P1, quantity: 1 }, { product_id: P2, quantity: 1 }])
    const r = await receiveStock(TENANT, LOC, v.items)
    expect(r.failures.map(f => f.productId)).toEqual([P1])
    expect(r.applied.map(a => a.productId)).toEqual([P2])
  })
})

describe('wasteStock (−N con motivo)', () => {
  it('resta, usa motivo damage y no permite saldo negativo', async () => {
    const w = validateWaste({ product_id: P1, quantity: 3, notes: 'Humedad', reference: 'ACTA-1' })
    expect(await wasteStock(TENANT, LOC, w, { userId: 'u-1' })).toEqual({ before: 10, after: 7 })
    expect(rpcCalls()[0].params).toMatchObject({ p_delta: -3, p_reason: 'damage', p_allow_negative: false, p_notes: 'Humedad', p_reference: 'ACTA-1' })
  })

  it('rechaza una merma mayor al stock con 409', async () => {
    const w = validateWaste({ product_id: P1, quantity: 99, notes: 'Robo' })
    await expect(wasteStock(TENANT, LOC, w)).rejects.toMatchObject({ status: 409 })
    expect(stock[P1]).toBe(10)
  })
})

describe('validaciones y resaltado', () => {
  it('validateReceiveItems rechaza cantidades no enteras, ≤0, repetidos y listas vacías', () => {
    expect(validateReceiveItems([]).ok).toBe(false)
    expect(validateReceiveItems([{ product_id: P1, quantity: 0 }]).ok).toBe(false)
    expect(validateReceiveItems([{ product_id: P1, quantity: 1.5 }]).ok).toBe(false)
    expect(validateReceiveItems([{ product_id: P1, quantity: -2 }]).ok).toBe(false)
    expect(validateReceiveItems([{ product_id: P1, quantity: 1 }, { product_id: P1, quantity: 2 }]).ok).toBe(false)
    expect(validateReceiveItems([{ product_id: P1, quantity: 3 }]).ok).toBe(true)
  })

  it('la referencia es opcional y se recorta', () => {
    const v = validateReceiveItems([{ product_id: P1, quantity: 1 }])
    expect(v.items[0].reference).toBeNull()
    expect(validateReceiveItems([{ product_id: P1, quantity: 1, reference: 'x'.repeat(300) }]).items[0].reference).toHaveLength(100)
  })

  it('la merma exige motivo', () => {
    expect(validateWaste({ product_id: P1, quantity: 1 }).ok).toBe(false)
    expect(validateWaste({ product_id: P1, quantity: 1, notes: '  ' }).ok).toBe(false)
    expect(validateWaste({ product_id: P1, quantity: 1, notes: 'Roto' }).ok).toBe(true)
  })

  it('movementFlag resalta salidas que no son venta', () => {
    expect(movementFlag({ delta: -2, reason: 'damage' })).toBe('outflow')
    expect(movementFlag({ delta: -2, reason: 'manual_adjustment' })).toBe('outflow')
    expect(movementFlag({ delta: -2, reason: 'sale' })).toBeNull()
    expect(movementFlag({ delta: 5, reason: 'restock' })).toBeNull()
  })
})

describe('POST /inventory/receive', () => {
  const call = async (body) => {
    const res = mockRes()
    await inventoryReceivePost({ body }, res)
    return res
  }

  it('el admin repone en su punto y recibe antes/después', async () => {
    const res = await call({ location_id: LOC, reference: 'FAC-9', items: [{ product_id: P1, quantity: 5 }] })
    expect(res.statusCode).toBe(200)
    expect(res.body).toMatchObject({ ok: true, applied: [{ product_id: P1, name: 'Volcán', before: 10, after: 15 }] })
  })

  it('un punto fuera de su alcance responde 403 y no toca el stock', async () => {
    const res = await call({ location_id: OTHER_LOC, items: [{ product_id: P1, quantity: 5 }] })
    expect(res.statusCode).toBe(403)
    expect(rpcCalls()).toHaveLength(0)
  })

  it('no repone productos que el punto no controla', async () => {
    tracked = [] // ningún producto con seguimiento
    const res = await call({ location_id: LOC, items: [{ product_id: P1, quantity: 5 }] })
    expect(res.statusCode).toBe(409)
    expect(res.body.code).toBe('NOT_TRACKED')
    expect(rpcCalls()).toHaveLength(0)
  })

  it('cantidad inválida responde 400', async () => {
    expect((await call({ location_id: LOC, items: [{ product_id: P1, quantity: -1 }] })).statusCode).toBe(400)
  })
})

describe('POST /inventory/waste', () => {
  it('sin motivo responde 400; con motivo registra la merma', async () => {
    const r1 = mockRes()
    await inventoryWastePost({ body: { location_id: LOC, product_id: P1, quantity: 2 } }, r1)
    expect(r1.statusCode).toBe(400)
    const r2 = mockRes()
    await inventoryWastePost({ body: { location_id: LOC, product_id: P1, quantity: 2, notes: 'Humedad' } }, r2)
    expect(r2.statusCode).toBe(200)
    expect(r2.body).toMatchObject({ before: 10, after: 8 })
  })
})

describe('GET /inventory/movements', () => {
  it('el admin consulta solo su punto', async () => {
    const res = mockRes()
    await inventoryMovementsGet({ query: {} }, res)
    expect(res.statusCode).toBe(200)
    const q = fake.current.calls.find(c => c.table === 'stock_movements')
    expect(filterValue(q, 'eq', 'location_id')).toBe(LOC)
  })

  it('el admin no puede pedir otro punto', async () => {
    const res = mockRes()
    await inventoryMovementsGet({ query: { location_id: OTHER_LOC } }, res)
    expect(res.statusCode).toBe(403)
  })

  it('el owner sin filtro ve todos sus puntos', async () => {
    fake.auth = { ...fake.auth, seller: { id: 'o-1', name: 'Dueño', role: 'owner' }, scope: { all: true, locationIds: [LOC, OTHER_LOC] } }
    const res = mockRes()
    await inventoryMovementsGet({ query: { reason: 'damage' } }, res)
    const q = fake.current.calls.find(c => c.table === 'stock_movements')
    expect(filterValue(q, 'in', 'location_id')).toEqual([LOC, OTHER_LOC])
    expect(filterValue(q, 'eq', 'reason')).toBe('damage')
  })

  it('rechaza motivos y fechas inválidas', async () => {
    const r1 = mockRes(); await inventoryMovementsGet({ query: { reason: 'robo' } }, r1)
    const r2 = mockRes(); await inventoryMovementsGet({ query: { from: 'ayer' } }, r2)
    expect([r1.statusCode, r2.statusCode]).toEqual([400, 400])
  })
})
