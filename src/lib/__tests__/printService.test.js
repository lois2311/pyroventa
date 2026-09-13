import { describe, it, expect } from 'vitest'
import { buildHTMLReceipt, formatReceiptText } from '../printService.js'

describe('printService — buildHTMLReceipt', () => {
  const sampleInvoice = {
    code: 'FAC-100',
    created_at: '2026-09-14T10:00:00Z',
    seller_name: 'Carlos Vendedor',
    pay_method: 'cash',
    total: 50000,
    items: [
      { product_name: 'Volcán Chispas', label: 'Caja x 6', qty: 2, subtotal: 50000 },
    ],
    observations: 'Cliente frecuente',
  }

  it('genera HTML con ancho receipt-80mm por defecto o cuando paper_width es 80mm', () => {
    const html = buildHTMLReceipt(sampleInvoice, { paper_width: '80mm' })
    expect(html).toContain('class="receipt-80mm"')
    expect(html).toContain('FAC-100')
    expect(html).toContain('Volcán Chispas')
    expect(html).toContain('Carlos Vendedor')
    expect(html).toContain('Cliente frecuente')
  })

  it('genera HTML con ancho receipt-58mm cuando paper_width es 58mm', () => {
    const html = buildHTMLReceipt(sampleInvoice, { paper_width: '58mm' })
    expect(html).toContain('class="receipt-58mm"')
  })

  it('incluye etiqueta img con filtros térmicos cuando config tiene logo_url', () => {
    const configWithLogo = {
      paper_width: '80mm',
      logo_url: 'https://example.com/storage/logos/empresa_logo.png',
    }
    const html = buildHTMLReceipt(sampleInvoice, configWithLogo)
    expect(html).toContain('<img src="https://example.com/storage/logos/empresa_logo.png"')
    expect(html).toContain('filter: grayscale(100%) contrast(150%)')
  })

  it('no incluye etiqueta img cuando no hay logo_url', () => {
    const html = buildHTMLReceipt(sampleInvoice, { paper_width: '80mm' })
    expect(html).not.toContain('<img')
  })
})

describe('printService — formatReceiptText', () => {
  it('formatea el texto del recibo con los encabezados y totales', () => {
    const invoice = {
      code: '001-002',
      created_at: '2026-09-14T12:00:00Z',
      seller_name: 'Ana Cajera',
      pay_method: 'transfer',
      transfer_provider: 'nequi',
      total: 30000,
      items: [
        { product_name: 'Chispitas', label: 'Caja x 12', qty: 1, subtotal: 30000 }
      ]
    }
    const text = formatReceiptText(invoice, { paper_width: '80mm' })
    expect(text).toContain('001-002')
    expect(text).toContain('Chispitas')
    expect(text).toContain('TOTAL')
    expect(text).toContain('Nequi')
  })
})
