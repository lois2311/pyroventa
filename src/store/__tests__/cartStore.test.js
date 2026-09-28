import { beforeEach, describe, expect, it, vi } from 'vitest'

// persist() escribe en localStorage; en Node no existe y solo avisa por consola
vi.spyOn(console, 'warn').mockImplementation(() => {})

const { useCartStore, productQtyInCart, overStockItems } = await import('../cartStore.js')

const unidad = { presentationId: 'p1-u', productId: 'p1', productName: 'Volcán', label: 'Unidad', price: 3000 }
const paquete = { presentationId: 'p1-x12', productId: 'p1', productName: 'Volcán', label: 'Paquete x12', price: 30000 }
const otro = { presentationId: 'p2-u', productId: 'p2', productName: 'Bengala', label: 'Unidad', price: 1500 }

const store = () => useCartStore.getState()

describe('cartStore: tope de stock', () => {
  beforeEach(() => store().clear())

  it('sin stock informado (negocio sin inventario) no pone tope', () => {
    for (let i = 0; i < 50; i++) expect(store().addItem(unidad)).toBe(true)
    expect(store().items[0].qty).toBe(50)
  })

  it('no agrega un producto agotado', () => {
    expect(store().addItem({ ...unidad, stock: 0 })).toBe(false)
    expect(store().items).toHaveLength(0)
  })

  it('el tope es por producto, sumando todas sus presentaciones', () => {
    expect(store().addItem({ ...unidad, stock: 3 })).toBe(true)
    expect(store().addItem({ ...paquete, stock: 3 })).toBe(true)
    expect(store().addItem({ ...unidad, stock: 3 })).toBe(true)
    expect(store().addItem({ ...paquete, stock: 3 })).toBe(false)
    expect(productQtyInCart(store().items, 'p1')).toBe(3)
    // Otro producto no se ve afectado
    expect(store().addItem({ ...otro, stock: 1 })).toBe(true)
  })

  it('updateQty no sube por encima del stock pero siempre deja bajar', () => {
    store().addItem({ ...unidad, stock: 2 })
    expect(store().updateQty('p1-u', 2)).toBe(true)
    expect(store().updateQty('p1-u', 3)).toBe(false)
    expect(store().items[0].qty).toBe(2)
    expect(store().updateQty('p1-u', 1)).toBe(true)
    expect(store().updateQty('p1-u', 0)).toBe(true)
    expect(store().items).toHaveLength(0)
  })

  it('syncStock actualiza el tope y overStockItems detecta el exceso', () => {
    store().addItem({ ...unidad, stock: 5 })
    store().updateQty('p1-u', 4)
    expect(overStockItems(store().items)).toEqual([])

    // Otro vendedor cobró: ahora quedan 2
    store().syncStock(new Map([['p1', 2]]))
    expect(store().items[0].stock).toBe(2)
    expect(overStockItems(store().items)).toEqual([{ productId: 'p1', productName: 'Volcán', qty: 4, stock: 2 }])
    expect(store().updateQty('p1-u', 5)).toBe(false)
  })

  it('agregar refresca el stock de las demás presentaciones del producto', () => {
    store().addItem({ ...unidad, stock: 10 })
    store().addItem({ ...paquete, stock: 4 })
    expect(store().items.map(i => i.stock)).toEqual([4, 4])
  })
})
