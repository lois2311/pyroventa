import { describe, it, expect, vi, beforeEach } from 'vitest'
import { groupItemsByProduct } from '../services/stockService.js'

describe('stockService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('groupItemsByProduct', () => {
    it('agrupa y totaliza cantidades del mismo producto en diferentes presentaciones', () => {
      const items = [
        { productId: 'p1', qty: 2 },
        { productId: 'p1', qty: 3 },
        { productId: 'p2', qty: 1 },
      ]
      const map = groupItemsByProduct(items)
      expect(map.get('p1')).toBe(5)
      expect(map.get('p2')).toBe(1)
      expect(map.size).toBe(2)
    })

    it('soporta la clave alternativa product_id y quantity', () => {
      const items = [
        { product_id: 'prod-abc', quantity: 4 },
        { product_id: 'prod-abc', quantity: 6 },
      ]
      const map = groupItemsByProduct(items)
      expect(map.get('prod-abc')).toBe(10)
    })

    it('ignora items con cantidad <= 0 o sin ID de producto', () => {
      const items = [
        { productId: 'p1', qty: 0 },
        { productId: 'p1', qty: -5 },
        { productId: '', qty: 10 },
        { qty: 5 },
        { productId: 'p2', qty: 'no-es-numero' },
      ]
      const map = groupItemsByProduct(items)
      expect(map.size).toBe(0)
    })
  })
})
