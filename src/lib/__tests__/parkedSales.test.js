import { beforeEach, describe, expect, it } from 'vitest'

// localStorage mínimo en memoria (Node no lo trae)
const mem = new Map()
globalThis.localStorage = {
  getItem: k => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: k => mem.delete(k),
}

const { loadParked, parkSale, takeParked, parkedTotal, parkedCount } = await import('../parkedSales.js')

const items = [
  { presentationId: 'a', qty: 2, subtotal: 6000 },
  { presentationId: 'b', qty: 1, subtotal: 1500 },
]

describe('ventas en pausa (F8)', () => {
  beforeEach(() => mem.clear())

  it('guarda por punto de venta, la más reciente primero', () => {
    parkSale('l1', items, 1)
    parkSale('l1', [items[1]], 2)
    parkSale('l2', items, 3)
    expect(loadParked('l1').map(p => p.parkedAt)).toEqual([2, 1])
    expect(loadParked('l2')).toHaveLength(1)
  })

  it('retomar la quita de la lista', () => {
    const [entry] = parkSale('l1', items)
    const { entry: taken, list } = takeParked('l1', entry.id)
    expect(taken.items).toEqual(items)
    expect(list).toEqual([])
    expect(loadParked('l1')).toEqual([])
  })

  it('id desconocido no rompe y no quita nada', () => {
    parkSale('l1', items)
    const { entry, list } = takeParked('l1', 'nope')
    expect(entry).toBeNull()
    expect(list).toHaveLength(1)
  })

  it('guarda como máximo 5', () => {
    for (let i = 0; i < 7; i++) parkSale('l1', items, i)
    expect(loadParked('l1').map(p => p.parkedAt)).toEqual([6, 5, 4, 3, 2])
  })

  it('ignora datos corruptos', () => {
    mem.set('vd_parked_l1', '{no es json')
    expect(loadParked('l1')).toEqual([])
    mem.set('vd_parked_l1', JSON.stringify([{ id: 'x', items: [] }, null]))
    expect(loadParked('l1')).toEqual([])
  })

  it('total y unidades', () => {
    const [entry] = parkSale('l1', items)
    expect(parkedTotal(entry)).toBe(7500)
    expect(parkedCount(entry)).toBe(3)
  })
})
