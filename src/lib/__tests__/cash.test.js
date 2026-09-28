import { describe, expect, it } from 'vitest'
import { suggestCashAmounts } from '../cash.js'

describe('suggestCashAmounts', () => {
  it('sugiere el siguiente múltiplo de cada billete, sin repetir', () => {
    expect(suggestCashAmounts(78526)).toEqual([80000, 100000])
    expect(suggestCashAmounts(3000)).toEqual([5000, 10000, 20000])
    expect(suggestCashAmounts(3000, 5)).toEqual([5000, 10000, 20000, 50000, 100000])
  })

  it('un total redondo no se sugiere a sí mismo (eso es "Exacto")', () => {
    // Con billetes de 5k, 10k o 50k se paga exacto; con 20k, 60k; con 100k, 100k
    expect(suggestCashAmounts(50000)).toEqual([60000, 100000])
    // Múltiplo de todos los billetes: solo cabe "Exacto"
    expect(suggestCashAmounts(100000)).toEqual([])
  })

  it('totales grandes colapsan en pocas opciones', () => {
    expect(suggestCashAmounts(1296000)).toEqual([1300000])
  })

  it('sin total no sugiere nada', () => {
    expect(suggestCashAmounts(0)).toEqual([])
    expect(suggestCashAmounts(undefined)).toEqual([])
    expect(suggestCashAmounts('abc')).toEqual([])
  })
})
