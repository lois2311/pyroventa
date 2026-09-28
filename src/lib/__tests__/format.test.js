import { describe, it, expect } from 'vitest'
import { formatCOP, formatDayShort, formatRangeLabel, formatCOPShort } from '../format.js'

describe('formatDayShort', () => {
  it('formatea día y mes corto sin correrse por zona horaria', () => {
    expect(formatDayShort('2026-09-23')).toBe('23 sep')
    expect(formatDayShort('2026-01-01')).toBe('1 ene')
  })

  it('agrega el día de la semana del calendario', () => {
    expect(formatDayShort('2026-09-23', { weekday: true })).toBe('mié 23 sep')
    expect(formatDayShort('2026-09-27', { weekday: true })).toBe('dom 27 sep')
  })

  it('devuelve vacío o el valor original si no es una fecha ISO', () => {
    expect(formatDayShort('')).toBe('')
    expect(formatDayShort('ayer')).toBe('ayer')
  })
})

describe('formatRangeLabel', () => {
  it('un solo día muestra el año una vez', () => {
    expect(formatRangeLabel('2026-09-28', '2026-09-28')).toBe('28 sep 2026')
  })

  it('un rango del mismo año omite el primer año', () => {
    expect(formatRangeLabel('2026-09-22', '2026-09-28')).toBe('22 sep – 28 sep 2026')
  })

  it('un rango que cruza de año muestra ambos', () => {
    expect(formatRangeLabel('2025-12-30', '2026-01-02')).toBe('30 dic 2025 – 2 ene 2026')
  })
})

describe('formatCOPShort', () => {
  it('compacta miles y millones con coma decimal', () => {
    expect(formatCOPShort(950)).toBe('$950')
    expect(formatCOPShort(40_000)).toBe('$40k')
    expect(formatCOPShort(1_200_000)).toBe('$1,2M')
    expect(formatCOPShort(3_000_000)).toBe('$3M')
  })

  it('tolera valores no numéricos', () => {
    expect(formatCOPShort(null)).toBe('$0')
  })
})

describe('formatCOP', () => {
  it('usa punto de miles y sin decimales', () => {
    expect(formatCOP(2983999)).toBe('$2.983.999')
    expect(formatCOP(1500.6)).toBe('$1.501')
  })

  it('pone el signo antes del símbolo en negativos', () => {
    expect(formatCOP(-5000)).toBe('-$5.000')
    expect(formatCOP(-0.4)).toBe('$0')
  })
})
