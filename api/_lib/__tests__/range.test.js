import { describe, it, expect } from 'vitest'
import { parseRange, bogotaDayBounds } from '../range.js'

describe('parseRange', () => {
  it('from y to explícitos', () => {
    expect(parseRange({ from: '2026-12-01', to: '2026-12-24' })).toEqual({ from: '2026-12-01', to: '2026-12-24' })
  })
  it('date de retrocompatibilidad → from=to', () => {
    expect(parseRange({ date: '2026-12-24' })).toEqual({ from: '2026-12-24', to: '2026-12-24' })
  })
  it('sin parámetros → hoy Bogotá (from === to, formato YYYY-MM-DD)', () => {
    const r = parseRange({})
    expect(r.from).toBe(r.to)
    expect(r.from).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
  it('to < from → 400', () => {
    expect(() => parseRange({ from: '2026-12-24', to: '2026-12-01' })).toThrowError(/rango/i)
    try { parseRange({ from: '2026-12-24', to: '2026-12-01' }) } catch (e) { expect(e.status).toBe(400) }
  })
  it('formato inválido → 400', () => {
    try { parseRange({ from: '24/12/2026', to: '2026-12-24' }) } catch (e) { expect(e.status).toBe(400) }
  })
  it('solo from → to = from', () => {
    expect(parseRange({ from: '2026-12-01' })).toEqual({ from: '2026-12-01', to: '2026-12-01' })
  })
})

describe('bogotaDayBounds', () => {
  it('límites de un día en -05:00', () => {
    const { start, end } = bogotaDayBounds('2026-12-31', '2026-12-31')
    expect(start).toBe('2026-12-31T05:00:00.000Z') // 00:00 Bogotá
    expect(end).toBe('2027-01-01T05:00:00.000Z')   // 00:00 Bogotá del día siguiente
  })
})
