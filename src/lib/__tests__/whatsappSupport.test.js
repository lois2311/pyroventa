import { describe, it, expect } from 'vitest'
import { buildWhatsAppSupportUrl, formatTicketMessage } from '../whatsappSupport.js'

describe('whatsappSupport utilities', () => {
  it('formatTicketMessage genera un mensaje claro y ordenado para WhatsApp', () => {
    const message = formatTicketMessage({
      ticketCode: 'VND-1001',
      tenantName: 'Pirotecnia El Cohetón',
      categoryLabel: 'Impresora / Periféricos',
      locationName: 'Punto Norte',
      customText: 'La impresora no corta el papel',
    })

    expect(message).toContain('*TICKET DE SOPORTE VENDRA: VND-1001*')
    expect(message).toContain('Empresa: Pirotecnia El Cohetón')
    expect(message).toContain('Punto: Punto Norte')
    expect(message).toContain('Categoría: Impresora / Periféricos')
    expect(message).toContain('Detalle: La impresora no corta el papel')
  })

  it('buildWhatsAppSupportUrl formatea número y codifica enlace wa.me correctamente', () => {
    const url = buildWhatsAppSupportUrl({
      supportPhone: '+57 300 123 4567',
      ticketCode: 'VND-1002',
      tenantName: 'Luces Mágicas',
      categoryLabel: 'Caja y Cobros',
    })

    expect(url.startsWith('https://wa.me/573001234567?text=')).toBe(true)
    expect(url).toContain(encodeURIComponent('VND-1002'))
    expect(url).toContain(encodeURIComponent('Luces Mágicas'))
  })

  it('buildWhatsAppSupportUrl usa número por defecto si no se proporciona', () => {
    const url = buildWhatsAppSupportUrl({
      ticketCode: 'VND-1003',
      tenantName: 'Fuegos y Cohetes',
      categoryLabel: 'Sistema',
    })
    expect(url).toContain('https://wa.me/')
    expect(url).toContain(encodeURIComponent('VND-1003'))
  })
})
