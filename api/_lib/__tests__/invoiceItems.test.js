import { describe, it, expect } from 'vitest'
import { buildInvoiceItems, MAX_QTY } from '../invoiceItems.js'

// Catálogo tal como lo devuelve la BD (precio autoritativo)
const catalog = new Map([
  ['p1', { id: 'p1', label: 'Unidad',   price: 60000, product_id: 'prod1', product_name: 'ESTUCHE DE FUENTES' }],
  ['p2', { id: 'p2', label: 'Pack x12', price: 15000, product_id: 'prod2', product_name: 'GLOBOS' }],
])

describe('buildInvoiceItems — el precio lo pone el servidor', () => {
  it('ignora el precio que manda el cliente y usa el de la BD', () => {
    const { items, total, error } = buildInvoiceItems(
      [{ presentationId: 'p1', qty: 1, price: 1 }], // el cliente miente
      catalog,
    )
    expect(error).toBeUndefined()
    expect(items[0].price).toBe(60000)
    expect(items[0].subtotal).toBe(60000)
    expect(total).toBe(60000)
  })

  it('ignora el nombre y la etiqueta que manda el cliente', () => {
    const { items } = buildInvoiceItems(
      [{ presentationId: 'p1', qty: 1, productName: 'FALSO', label: 'FALSA' }],
      catalog,
    )
    expect(items[0].product_name).toBe('ESTUCHE DE FUENTES')
    expect(items[0].label).toBe('Unidad')
  })

  it('ignora un subtotal inventado y lo recalcula', () => {
    const { items, total } = buildInvoiceItems(
      [{ presentationId: 'p2', qty: 3, subtotal: 1 }],
      catalog,
    )
    expect(items[0].subtotal).toBe(45000)
    expect(total).toBe(45000)
  })

  it('suma varios items', () => {
    const { total } = buildInvoiceItems(
      [{ presentationId: 'p1', qty: 2 }, { presentationId: 'p2', qty: 1 }],
      catalog,
    )
    expect(total).toBe(135000)
  })
})

describe('buildInvoiceItems — forma del snapshot', () => {
  it('conserva los campos que leen los reportes SQL y los recibos', () => {
    const { items } = buildInvoiceItems([{ presentationId: 'p2', qty: 2 }], catalog)
    // report_range_products lee product_name/label/qty/subtotal del JSONB
    expect(items[0]).toEqual({
      presentationId: 'p2',
      productId:      'prod2',
      productName:    'GLOBOS',
      product_name:   'GLOBOS',
      label:          'Pack x12',
      price:          15000,
      qty:            2,
      subtotal:       30000,
    })
  })
})

describe('buildInvoiceItems — validación', () => {
  it('rechaza una factura sin items', () => {
    expect(buildInvoiceItems([], catalog).error).toBeTruthy()
    expect(buildInvoiceItems(null, catalog).error).toBeTruthy()
  })

  it('rechaza una presentación que no está en el catálogo del tenant', () => {
    const r = buildInvoiceItems([{ presentationId: 'de-otra-empresa', qty: 1 }], catalog)
    expect(r.error).toBeTruthy()
    expect(r.items).toBeUndefined()
  })

  it('rechaza cantidades no positivas o no enteras', () => {
    for (const qty of [0, -1, 1.5, NaN, 'dos', null, undefined]) {
      expect(buildInvoiceItems([{ presentationId: 'p1', qty }], catalog).error).toBeTruthy()
    }
  })

  it('rechaza cantidades absurdas', () => {
    expect(buildInvoiceItems([{ presentationId: 'p1', qty: MAX_QTY + 1 }], catalog).error).toBeTruthy()
    expect(buildInvoiceItems([{ presentationId: 'p1', qty: MAX_QTY }], catalog).error).toBeUndefined()
  })

  it('rechaza un item sin presentationId', () => {
    expect(buildInvoiceItems([{ qty: 1 }], catalog).error).toBeTruthy()
    expect(buildInvoiceItems([{ presentationId: '', qty: 1 }], catalog).error).toBeTruthy()
  })

  it('unifica líneas repetidas de la misma presentación', () => {
    const { items, total } = buildInvoiceItems(
      [{ presentationId: 'p1', qty: 1 }, { presentationId: 'p1', qty: 2 }],
      catalog,
    )
    expect(items).toHaveLength(1)
    expect(items[0].qty).toBe(3)
    expect(total).toBe(180000)
  })

  it('no deja que un precio corrupto en BD genere NaN', () => {
    const roto = new Map([['x', { id: 'x', label: 'U', price: null, product_id: 'p', product_name: 'ROTO' }]])
    expect(buildInvoiceItems([{ presentationId: 'x', qty: 1 }], roto).error).toBeTruthy()
  })

  it('acepta precio cero (producto de cortesía)', () => {
    const gratis = new Map([['g', { id: 'g', label: 'U', price: 0, product_id: 'p', product_name: 'CORTESIA' }]])
    const { total, error } = buildInvoiceItems([{ presentationId: 'g', qty: 2 }], gratis)
    expect(error).toBeUndefined()
    expect(total).toBe(0)
  })
})
