import { describe, it, expect, vi } from 'vitest'
import { buildHTMLReceipt, formatReceiptText, withTimeout, encodeEscPosRaster, RECEIPT_ENDORSEMENT, RECEIPT_BYLINE } from '../printService.js'

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

describe('printService — marca VENDRA en el ticket', () => {
  const invoice = {
    code: '4821', created_at: '2026-09-30T12:00:00Z', seller_name: 'Ana', pay_method: 'cash', total: 1000,
    items: [{ product_name: 'Chispitas', label: 'Unidad', qty: 1, subtotal: 1000 }],
  }
  const config = { paper_width: '58mm', header_lines: ['MI NEGOCIO'], footer_lines: ['¡Gracias!'] }

  it('pone la cabecera del negocio arriba y "VENDRA by flightdev" al final (texto)', () => {
    const lines = formatReceiptText(invoice, config).split('\n').map(l => l.trim())
    expect(RECEIPT_ENDORSEMENT).toBe('VENDRA by flightdev')
    expect(lines[0]).toBe('MI NEGOCIO')
    expect(lines.at(-1)).toBe(RECEIPT_ENDORSEMENT)
    expect(lines.indexOf('¡Gracias!')).toBeLessThan(lines.indexOf(RECEIPT_ENDORSEMENT))
  })

  it('imprime el logotipo VENDRA (40 mm, solo negro) y "by flightdev" después del pie en el HTML', () => {
    for (const paper_width of ['58mm', '80mm']) {
      const html = buildHTMLReceipt(invoice, { ...config, paper_width })
      expect(html).toContain('class="brand-logo"')
      expect(html).toContain('<svg')
      expect(html).toContain('width: 40mm')
      expect(html.indexOf('MI NEGOCIO')).toBeLessThan(html.indexOf('¡Gracias!'))
      expect(html.indexOf('¡Gracias!')).toBeLessThan(html.indexOf('brand-logo"'))
      expect(html.indexOf('brand-logo"')).toBeLessThan(html.lastIndexOf(RECEIPT_BYLINE))
    }
  })

  it('el logotipo del ticket no usa colores ni grises (1 bit)', () => {
    const html = buildHTMLReceipt(invoice, config)
    const svg = html.slice(html.indexOf('<svg'), html.indexOf('</svg>'))
    expect(svg).not.toMatch(/#B4E854|#7FB52E|#EEF2F7|opacity/i)
  })

  it('formatReceiptText sin respaldo omite la línea de marca (la imprime el logotipo)', () => {
    const lines = formatReceiptText(invoice, config, { endorsement: false }).split('\n').map(l => l.trim())
    expect(lines).not.toContain(RECEIPT_ENDORSEMENT)
    expect(lines.at(-1)).toBe('¡Gracias!')
  })
})

describe('encodeEscPosRaster', () => {
  const px = (v) => [v, v, v, 255]

  it('arma GS v 0 con cabecera y filas empaquetadas a 1 bit (MSB a la izquierda)', () => {
    // 10 px de ancho x 2 de alto: fila 0 = negro,blanco alternados; fila 1 = todo negro
    const row0 = Array.from({ length: 10 }, (_, x) => px(x % 2 === 0 ? 0 : 255)).flat()
    const row1 = Array.from({ length: 10 }, () => px(0)).flat()
    const out = encodeEscPosRaster({ width: 10, height: 2, data: [...row0, ...row1] })
    expect([...out.slice(0, 8)]).toEqual([0x1D, 0x76, 0x30, 0x00, 2, 0, 2, 0])
    expect([...out.slice(8)]).toEqual([0b10101010, 0b10000000, 0b11111111, 0b11000000])
  })

  it('aplica el umbral de luminancia < 140 y trata lo transparente como blanco', () => {
    const data = [...px(139), ...px(140), 0, 0, 0, 0, ...px(0)]
    const out = encodeEscPosRaster({ width: 4, height: 1, data })
    expect(out[8]).toBe(0b10010000)
  })
})

describe('withTimeout', () => {
  it('rechaza con el mensaje dado si la promesa no termina a tiempo', async () => {
    vi.useFakeTimers()
    try {
      const never = new Promise(() => {})
      const p = withTimeout(never, 8000, 'no respondió')
      vi.advanceTimersByTime(8000)
      await expect(p).rejects.toThrow('no respondió')
    } finally {
      vi.useRealTimers()
    }
  })

  it('resuelve con el valor si llega antes del tope', async () => {
    await expect(withTimeout(Promise.resolve('ok'), 1000, 'tarde')).resolves.toBe('ok')
  })
})
