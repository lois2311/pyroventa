import { describe, it, expect } from 'vitest'
import { normalizeWhatsAppNumber } from '../../../lib/whatsappSupport.js'

describe('SupportDesk helpers', () => {
  it('normaliza números de WhatsApp colombianos sin importar formato', () => {
    expect(normalizeWhatsAppNumber('3001234567')).toBe('573001234567')
    expect(normalizeWhatsAppNumber('+57 310 987 6543')).toBe('573109876543')
    expect(normalizeWhatsAppNumber('573155555555')).toBe('573155555555')
  })
})
