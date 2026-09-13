import { describe, it, expect } from 'vitest'
import { parseRange, bogotaDayBounds, previousPeriod } from '../range.js'

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
  it('fecha inexistente en calendario → 400', () => {
    try { parseRange({ from: '2026-13-40', to: '2026-13-40' }) } catch (e) { expect(e.status).toBe(400) }
    expect(() => parseRange({ from: '2026-02-30', to: '2026-02-30' })).toThrow()
  })
})

describe('bogotaDayBounds', () => {
  it('límites de un día en -05:00', () => {
    const { start, end } = bogotaDayBounds('2026-12-31', '2026-12-31')
    expect(start).toBe('2026-12-31T05:00:00.000Z') // 00:00 Bogotá
    expect(end).toBe('2027-01-01T05:00:00.000Z')   // 00:00 Bogotá del día siguiente
  })
})

describe('previousPeriod', () => {
  it('un solo día → el día anterior', () => {
    expect(previousPeriod('2026-12-24', '2026-12-24')).toEqual({ from: '2026-12-23', to: '2026-12-23' })
  })
  it('rango de varios días → mismo tamaño, inmediatamente antes', () => {
    expect(previousPeriod('2026-12-08', '2026-12-14')).toEqual({ from: '2026-12-01', to: '2026-12-07' })
  })
  it('cruza fin de mes/año correctamente', () => {
    expect(previousPeriod('2027-01-01', '2027-01-01')).toEqual({ from: '2026-12-31', to: '2026-12-31' })
  })
})
