import { describe, it, expect } from 'vitest'
import {
  sortByUrgency, needsRestock, parseQty, previewBalance, movementTone, movementsToRows, buildReceivePayload,
} from '../inventoryUi.js'

const item = (name, qty, extra = {}) => ({ name, stock_quantity: qty, stock_tracked: true, low_stock_threshold: 5, ...extra })

describe('cola "Por reponer"', () => {
  it('ordena agotados, luego stock bajo (menor saldo primero), luego disponibles y al final los no controlados', () => {
    const sorted = sortByUrgency([
      item('Zeta', 50), item('Bengala', 3), item('Volcán', 0), item('Servicio', 0, { stock_tracked: false }),
      item('Cohete', 1), item('Alfa', 20),
    ])
    expect(sorted.map(i => i.name)).toEqual(['Volcán', 'Cohete', 'Bengala', 'Alfa', 'Zeta', 'Servicio'])
  })

  it('no muta la lista original', () => {
    const list = [item('B', 9), item('A', 0)]
    sortByUrgency(list)
    expect(list.map(i => i.name)).toEqual(['B', 'A'])
  })

  it('needsRestock: agotado y bajo sí; disponible y no controlado no', () => {
    expect(needsRestock(item('a', 0))).toBe(true)
    expect(needsRestock(item('a', 5))).toBe(true)
    expect(needsRestock(item('a', 6))).toBe(false)
    expect(needsRestock(item('a', 0, { stock_tracked: false }))).toBe(false)
  })
})

describe('vista previa del saldo', () => {
  it('3 + 20 → 23', () => {
    expect(previewBalance(3, '20')).toEqual({ valid: true, next: 23 })
  })
  it('la merma resta', () => {
    expect(previewBalance(10, 4, -1)).toEqual({ valid: true, next: 6 })
  })
  it('cantidad inválida no cambia el saldo', () => {
    for (const bad of ['', '0', '-2', '1.5', 'abc']) expect(previewBalance(3, bad)).toEqual({ valid: false, next: 3 })
  })
  it('parseQty solo acepta enteros positivos', () => {
    expect(parseQty('12')).toBe(12)
    expect(parseQty('')).toBeNull()
    expect(parseQty('0')).toBeNull()
  })
})

describe('bitácora', () => {
  it('tono: salida resaltada, reposición de marca, resto neutro', () => {
    expect(movementTone({ flag: 'outflow', reason: 'damage' })).toBe('outflow')
    expect(movementTone({ flag: null, reason: 'restock' })).toBe('restock')
    expect(movementTone({ flag: null, reason: 'sale' })).toBe('neutral')
  })

  it('exporta las columnas visibles con motivo y rol en español', () => {
    const [row] = movementsToRows([{
      created_at: '2026-10-03T15:00:00Z', location_name: 'Centro', product_name: 'Volcán',
      user_name: 'Ana', user_role: 'admin', reason: 'damage', stock_before: 10, delta: -3, final_stock: 7,
      reference: null, notes: 'Humedad', flag: 'outflow',
    }])
    expect(row).toMatchObject({
      Punto: 'Centro', Producto: 'Volcán', Usuario: 'Ana', Rol: 'Admin', Motivo: 'Merma',
      'Stock antes': 10, 'Variación': -3, 'Stock después': 7, Referencia: '', Notas: 'Humedad', Salida: 'Sí',
    })
  })
})

describe('payload de recepción', () => {
  it('agrupa líneas con referencia global opcional', () => {
    expect(buildReceivePayload('l-1', [{ productId: 'p1', quantity: '5' }, { productId: 'p2', quantity: '20' }], ' FAC-9 ', ''))
      .toEqual({ location_id: 'l-1', reference: 'FAC-9', items: [{ product_id: 'p1', quantity: 5 }, { product_id: 'p2', quantity: 20 }] })
  })
  it('sin referencia ni notas no las envía', () => {
    expect(buildReceivePayload('l-1', [{ productId: 'p1', quantity: 1 }])).toEqual({ location_id: 'l-1', items: [{ product_id: 'p1', quantity: 1 }] })
  })
})
