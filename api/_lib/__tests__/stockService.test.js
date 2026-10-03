import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  groupItemsByProduct,
  adjustStock,
  initProductStock,
} from '../services/stockService.js'
import { supabaseAdmin } from '../supabaseAdmin.js'

vi.mock('../supabaseAdmin.js', () => ({
  supabaseAdmin: {
    from: vi.fn(),
  },
}))

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

  describe('adjustStock', () => {
    it('ajusta la cantidad exacta y registra el delta respecto a la existencia previa', async () => {
      const upsertMock = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { product_id: 'p1', quantity: 25 },
            error: null,
          }),
        }),
      })
      const insertMock = vi.fn().mockResolvedValue({ error: null })

      supabaseAdmin.from.mockImplementation((table) => {
        if (table === 'stock') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: { quantity: 15 },
              error: null,
            }),
            upsert: upsertMock,
          }
        }
        if (table === 'stock_movements') {
          return {
            insert: insertMock,
          }
        }
        return {}
      })

      const res = await adjustStock(
        'tenant-1',
        'loc-1',
        'p1',
        25,
        'manual_adjustment',
        'user-1',
        'Conteo físico'
      )

      expect(res.ok).toBe(true)
      expect(res.quantity).toBe(25)
      expect(res.delta).toBe(10) // 25 - 15

      expect(upsertMock).toHaveBeenCalledWith(
        expect.objectContaining({
          tenant_id: 'tenant-1',
          location_id: 'loc-1',
          product_id: 'p1',
          quantity: 25,
        }),
        expect.anything()
      )

      expect(insertMock).toHaveBeenCalledWith(
        expect.objectContaining({
          product_id: 'p1',
          delta: 10,
          final_stock: 25,
          reason: 'manual_adjustment',
          notes: 'Conteo físico',
        })
      )
    })
  })

  describe('initProductStock', () => {
    it('inicializa stock en todas las ubicaciones si locationId es null', async () => {
      const upsertMock = vi.fn().mockResolvedValue({ error: null })
      const insertMock = vi.fn().mockResolvedValue({ error: null })

      supabaseAdmin.from.mockImplementation((table) => {
        if (table === 'locations') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({
                data: [{ id: 'loc-1' }, { id: 'loc-2' }],
                error: null,
              }),
            }),
          }
        }
        if (table === 'stock') {
          return {
            upsert: upsertMock,
          }
        }
        if (table === 'stock_movements') {
          return {
            insert: insertMock,
          }
        }
        return {}
      })

      const res = await initProductStock('tenant-1', 'p1', 50, null, 'user-1')
      expect(res.ok).toBe(true)
      expect(res.locations).toBe(2)

      expect(upsertMock).toHaveBeenCalledWith(
        [
          expect.objectContaining({ location_id: 'loc-1', quantity: 50 }),
          expect.objectContaining({ location_id: 'loc-2', quantity: 50 }),
        ],
        expect.anything()
      )
    })
  })
})
