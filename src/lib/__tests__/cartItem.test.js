import { describe, expect, it } from 'vitest'
import { buildCartItem, activePresentations, stockWarning } from '../cartItem.js'

const product = {
  id: 'p1', name: 'Volcán', stock_quantity: 3,
  presentations: [
    { id: 'p1-u', label: 'Unidad', price: 3000 },
    { id: 'p1-x', label: 'Caja', price: 30000, active: false },
    { id: 'p1-d', label: 'Docena', price: 9000, is_differential: true, base_price: 10000 },
  ],
}

describe('cartItem', () => {
  it('presentaciones activas', () => {
    expect(activePresentations(product).map(p => p.id)).toEqual(['p1-u', 'p1-d'])
    expect(activePresentations({})).toEqual([])
  })

  it('arma el item con o sin inventario', () => {
    expect(buildCartItem(product, product.presentations[0], true)).toMatchObject({
      presentationId: 'p1-u', productId: 'p1', productName: 'Volcán', price: 3000, stock: 3, isLocationPrice: false,
    })
    expect(buildCartItem(product, product.presentations[0], false).stock).toBeNull()
    expect(buildCartItem(product, product.presentations[2], true)).toMatchObject({ isLocationPrice: true, companyPrice: 10000 })
  })

  it('aviso de stock con tono de mostrador', () => {
    expect(stockWarning({ name: 'Volcán', stock_quantity: 0 })).toBe('Sin existencia. Quedan 0 de Volcán.')
    expect(stockWarning({ name: 'Volcán', stock_quantity: 2 })).toBe('Quedan 2 de Volcán y ya están en el ticket.')
  })
})
