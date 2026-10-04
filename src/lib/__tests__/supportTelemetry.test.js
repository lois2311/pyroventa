import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { collectTechnicalContext } from '../supportTelemetry.js'

describe('supportTelemetry', () => {
  beforeEach(() => {
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 TestBrowser',
      onLine: true,
    })
    vi.stubGlobal('window', {
      location: { href: 'http://localhost:5173/caja' },
      innerWidth: 1024,
      innerHeight: 768,
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('recopila datos de entorno, conectividad y pantalla sin fallar', () => {
    const context = collectTechnicalContext({
      location: { id: 'loc-1', name: 'Stand 1' },
      register: { id: 'reg-1', name: 'Caja 1' },
      activeInvoice: { code: '4821', total: 45000 },
      qzStatus: 'connected',
    })

    expect(context.online).toBe(true)
    expect(context.ua).toBe('Mozilla/5.0 TestBrowser')
    expect(context.url).toBe('http://localhost:5173/caja')
    expect(context.screen).toBe('1024x768')
    expect(context.location_id).toBe('loc-1')
    expect(context.location_name).toBe('Stand 1')
    expect(context.register_name).toBe('Caja 1')
    expect(context.invoice_code).toBe('4821')
    expect(context.qz_status).toBe('connected')
    expect(context.timestamp).toBeDefined()
  })

  it('maneja parámetros vacíos o nulos de forma segura', () => {
    const context = collectTechnicalContext()
    expect(context.online).toBe(true)
    expect(context.location_id).toBeNull()
    expect(context.invoice_code).toBeNull()
  })
})
