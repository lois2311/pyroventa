import { describe, it, expect } from 'vitest'
import { shotsInName, compareProducts } from '../productSort.js'

const p = (name, sort_order = 1) => ({ name, categories: { sort_order } })
const sorted = (names) => names.map(n => p(n)).sort(compareProducts).map(x => x.name)

describe('shotsInName', () => {
  it('lee la cantidad antes de la palabra TIROS', () => {
    expect(shotsInName('TORTA 30 TIROS')).toBe(30)
    expect(shotsInName('TORTA ANACONDA 100 TIROS')).toBe(100)
    expect(shotsInName('METRALLETA X 200 TIROS')).toBe(200)
  })

  it('ignora el calibre decimal que va después', () => {
    expect(shotsInName('TORTA 36 TIROS 0,6')).toBe(36)
    expect(shotsInName('TORTA 36 TIROS 0,8')).toBe(36)
  })

  it('tolera espacios de más en el nombre', () => {
    expect(shotsInName('TORTA  49 TIROS')).toBe(49)
  })

  it('acepta el singular TIRO', () => {
    expect(shotsInName('VOLADOR 1 TIRO')).toBe(1)
  })

  it('cae al último entero cuando no dice TIROS', () => {
    expect(shotsInName('TORTA PERLAS 96')).toBe(96)
    expect(shotsInName('VOLCAN #4')).toBe(4)
  })

  it('devuelve null si el nombre no tiene números', () => {
    expect(shotsInName('GLOBOS')).toBeNull()
    expect(shotsInName('')).toBeNull()
    expect(shotsInName(null)).toBeNull()
  })
})

describe('compareProducts', () => {
  it('ordena las tortas por tiros ascendente, no alfabéticamente', () => {
    expect(sorted(['TORTA 104 TIROS', 'TORTA 15 TIROS', 'TORTA 30 TIROS']))
      .toEqual(['TORTA 15 TIROS', 'TORTA 30 TIROS', 'TORTA 104 TIROS'])
  })

  it('mezcla las tortas con nombre según sus tiros', () => {
    expect(sorted([
      'TORTA 30 TIROS',
      'TORTA ANACONDA 100 TIROS',
      'TORTA DIOSES 16 TIROS',
      'TORTA 19 TIROS',
    ])).toEqual([
      'TORTA DIOSES 16 TIROS',
      'TORTA 19 TIROS',
      'TORTA 30 TIROS',
      'TORTA ANACONDA 100 TIROS',
    ])
  })

  it('desempata por nombre cuando los tiros coinciden', () => {
    expect(sorted(['TORTA MUSICAL 16 TIROS', 'TORTA DIOSES 16 TIROS']))
      .toEqual(['TORTA DIOSES 16 TIROS', 'TORTA MUSICAL 16 TIROS'])
  })

  it('deja al final los productos sin cantidad', () => {
    expect(sorted(['GLOBOS', 'TORTA 30 TIROS', 'ANCHETAS']))
      .toEqual(['TORTA 30 TIROS', 'ANCHETAS', 'GLOBOS'])
  })

  it('respeta el orden de categoría por encima de los tiros', () => {
    const items = [p('TORTA 16 TIROS', 5), p('BAZUCA 600 TIROS', 1)]
    expect(items.sort(compareProducts).map(x => x.name))
      .toEqual(['BAZUCA 600 TIROS', 'TORTA 16 TIROS'])
  })
})
