import { describe, it, expect } from 'vitest'
import { getStockStatus, stockCap } from '../stockStatus.js'
import { buildCartItem } from '../cartItem.js'
import { overStockItems, useCartStore } from '../../store/cartStore.js'

const p = (o) => ({ id: 'p1', name: 'Volcán', stock_tracked: true, stock_quantity: 10, low_stock_threshold: 5, ...o })

describe('getStockStatus', () => {
  it('clasifica según cantidad y umbral efectivo', () => {
    expect(getStockStatus(p({ stock_quantity: 0 }))).toBe('out_of_stock')
    expect(getStockStatus(p({ stock_quantity: 5 }))).toBe('low_stock')
    expect(getStockStatus(p({ stock_quantity: 6 }))).toBe('in_stock')
    expect(getStockStatus(p({ stock_quantity: 6, low_stock_threshold: 8 }))).toBe('low_stock')
  })

  it('sin control gana sobre cualquier cantidad', () => {
    expect(getStockStatus(p({ stock_tracked: false, stock_quantity: 0 }))).toBe('untracked')
  })

  it('un payload en caché sin los campos nuevos se trata como controlado con umbral 5', () => {
    expect(getStockStatus({ stock_quantity: 3 })).toBe('low_stock')
  })
})

describe('productos sin control en el carrito', () => {
  it('no tienen tope de stock y se venden en cualquier cantidad', () => {
    const product = p({ stock_tracked: false, stock_quantity: 0 })
    expect(stockCap(product)).toBeNull()
    const item = buildCartItem(product, { id: 'pr1', label: 'Hora', price: 10 }, true)
    expect(item.stock).toBeNull()
    useCartStore.setState({ items: [] })
    for (let i = 0; i < 20; i++) expect(useCartStore.getState().addItem(item)).toBe(true)
    expect(overStockItems(useCartStore.getState().items)).toEqual([])
  })

  it('los controlados siguen topados por su stock', () => {
    const item = buildCartItem(p({ stock_quantity: 1 }), { id: 'pr1', label: 'U', price: 10 }, true)
    expect(item.stock).toBe(1)
  })
})
