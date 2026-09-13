import { describe, it, expect } from 'vitest'
import { buildInvoiceItems } from '../invoiceItems.js'

describe('Precios diferenciales y catálogo por punto', () => {
  const baseCatalog = new Map([
    ['pres-1', { label: 'Unidad', price: 20000, product_id: 'prod-1', product_name: 'CHISPAS' }],
    ['pres-2', { label: 'Docena', price: 50000, product_id: 'prod-2', product_name: 'VOLCANES' }],
  ])

  it('usa precios base de catálogo cuando no hay diferencial', () => {
    const { items, total } = buildInvoiceItems(
      [{ presentationId: 'pres-1', qty: 2 }],
      baseCatalog,
    )
    expect(items[0].price).toBe(20000)
    expect(total).toBe(40000)
  })

  it('usa precio diferencial del punto cuando el catálogo fue cargado con override', () => {
    // Simula catálogo enriquecido con location_prices para un punto específico
    const locationCatalog = new Map([
      ['pres-1', { label: 'Unidad', price: 24000, product_id: 'prod-1', product_name: 'CHISPAS' }], // diferencial
      ['pres-2', { label: 'Docena', price: 50000, product_id: 'prod-2', product_name: 'VOLCANES' }], // base
    ])

    const { items, total } = buildInvoiceItems(
      [{ presentationId: 'pres-1', qty: 2 }, { presentationId: 'pres-2', qty: 1 }],
      locationCatalog,
    )
    expect(items[0].price).toBe(24000)
    expect(items[1].price).toBe(50000)
    expect(total).toBe(98000)
  })

  it('permite edición sobre precio diferencial del punto y registra auditoría contra el precio del punto', () => {
    const locationCatalog = new Map([
      ['pres-1', { label: 'Unidad', price: 24000, product_id: 'prod-1', product_name: 'CHISPAS' }],
    ])

    const { items, total, auditLogs } = buildInvoiceItems(
      [{ presentationId: 'pres-1', qty: 1, is_price_edited: true, price: 22000, price_edit_reason: 'Ajuste especial sede norte' }],
      locationCatalog,
    )
    expect(total).toBe(22000)
    expect(items[0].price).toBe(22000)
    expect(items[0].original_price).toBe(24000)
    expect(auditLogs[0].original_price).toBe(24000)
    expect(auditLogs[0].edited_price).toBe(22000)
    expect(auditLogs[0].difference).toBe(-2000)
    expect(auditLogs[0].reason).toBe('Ajuste especial sede norte')
  })
})
