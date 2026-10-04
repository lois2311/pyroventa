import { describe, it, expect } from 'vitest'
import {
  SUPPORT_CATALOG,
  getCategoryById,
  getQuickTips,
} from '../supportCategories.js'

describe('supportCategories catalog', () => {
  it('contiene las 5 categorías esenciales más otra', () => {
    const ids = SUPPORT_CATALOG.map(c => c.id)
    expect(ids).toContain('printer')
    expect(ids).toContain('payment')
    expect(ids).toContain('inventory')
    expect(ids).toContain('auth')
    expect(ids).toContain('system')
    expect(ids).toContain('other')
  })

  it('cada categoría tiene nombre, descripción y problemas frecuentes con consejos de auto-ayuda', () => {
    const printer = getCategoryById('printer')
    expect(printer).toBeDefined()
    expect(printer.label).toMatch(/impresora/i)
    expect(printer.issues.length).toBeGreaterThan(0)
    expect(printer.issues[0]).toHaveProperty('id')
    expect(printer.issues[0]).toHaveProperty('label')
    expect(printer.issues[0]).toHaveProperty('tip')
  })

  it('getQuickTips devuelve consejos de auto-resolución para un problema dado', () => {
    const tips = getQuickTips('printer', 'qz_offline')
    expect(tips).toBeDefined()
    expect(tips).toMatch(/QZ Tray|8182|navegador/i)
  })
})
