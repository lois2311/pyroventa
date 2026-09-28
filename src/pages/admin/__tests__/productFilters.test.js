import { describe, expect, it } from 'vitest'
import { filterProducts, productFacets, hasActiveFilters, NO_CATEGORY } from '../productFilters.js'
import { matchesQuery, normalizeText } from '../../../lib/search.js'

const volcanes = { id: 'c1', name: 'Volcanes', icon: '🌋' }
const bengalas = { id: 'c2', name: 'Luces de bengala', icon: '✨' }
const P = [
  { id: 'p1', name: 'Volcán mágico', active: true, categories: volcanes, stock_quantity: 30, presentations: [{ label: 'Unidad', price: 3000 }] },
  { id: 'p2', name: 'Bengala dorada x10', active: true, categories: bengalas, stock_quantity: 3, presentations: [{ label: 'Unidad', price: 4500 }, { label: 'Pack x12', price: 39000 }] },
  { id: 'p3', name: 'Cohete silbador', active: false, categories: volcanes, stock_quantity: 0, presentations: [{ label: 'Unidad', price: 6000 }] },
  { id: 'p4', name: 'Chispitas', active: true, categories: null, stock_quantity: 12, presentations: [] },
]
const names = (list) => list.map(p => p.name)

describe('search', () => {
  it('ignora tildes, mayúsculas y orden de palabras', () => {
    expect(normalizeText('  Volcán MÁGICO ')).toBe('volcan magico')
    expect(matchesQuery(['Volcán mágico'], 'magico volc')).toBe(true)
    expect(matchesQuery(['Volcán mágico'], 'volcan rojo')).toBe(false)
    expect(matchesQuery(['Volcán mágico'], '   ')).toBe(true)
  })
})

describe('filterProducts', () => {
  it('busca por nombre, categoría y presentación', () => {
    expect(names(filterProducts(P, { q: 'volcan' }))).toEqual(['Cohete silbador', 'Volcán mágico']) // nombre o categoría
    expect(names(filterProducts(P, { q: 'bengala' }))).toEqual(['Bengala dorada x10'])
    expect(names(filterProducts(P, { q: 'pack' }))).toEqual(['Bengala dorada x10'])
  })

  it('filtra por categoría, incluida "Sin categoría"', () => {
    expect(names(filterProducts(P, { cat: 'c1' }))).toEqual(['Cohete silbador', 'Volcán mágico'])
    expect(names(filterProducts(P, { cat: NO_CATEGORY }))).toEqual(['Chispitas'])
  })

  it('filtra por estado y stock', () => {
    expect(names(filterProducts(P, { status: 'inactive' }))).toEqual(['Cohete silbador'])
    expect(names(filterProducts(P, { status: 'incomplete' }))).toEqual(['Chispitas'])
    expect(names(filterProducts(P, { stock: 'out' }))).toEqual(['Cohete silbador'])
    expect(names(filterProducts(P, { stock: 'low' }))).toEqual(['Bengala dorada x10'])
  })

  it('combina filtros', () => {
    expect(names(filterProducts(P, { cat: 'c1', status: 'active' }))).toEqual(['Volcán mágico'])
    expect(filterProducts(P, { cat: 'c2', stock: 'out' })).toEqual([])
  })

  it('ordena por nombre, precio y stock; sin precio al final', () => {
    expect(names(filterProducts(P))).toEqual(['Bengala dorada x10', 'Chispitas', 'Cohete silbador', 'Volcán mágico'])
    expect(names(filterProducts(P, { sort: 'price-asc' }))).toEqual(['Volcán mágico', 'Bengala dorada x10', 'Cohete silbador', 'Chispitas'])
    expect(names(filterProducts(P, { sort: 'price-desc' }))).toEqual(['Bengala dorada x10', 'Cohete silbador', 'Volcán mágico', 'Chispitas'])
    expect(names(filterProducts(P, { sort: 'stock-asc' }))).toEqual(['Cohete silbador', 'Bengala dorada x10', 'Chispitas', 'Volcán mágico'])
  })

  it('no modifica el arreglo original', () => {
    const copy = [...P]
    filterProducts(P, { sort: 'price-desc' })
    expect(P).toEqual(copy)
  })
})

describe('productFacets', () => {
  it('cuenta categorías (Sin categoría al final) y estados', () => {
    const { categories, counts } = productFacets(P)
    expect(categories.map(c => [c.name, c.count])).toEqual([['Luces de bengala', 1], ['Volcanes', 2], ['Sin categoría', 1]])
    expect(counts).toEqual({ all: 4, active: 3, inactive: 1, incomplete: 1, out: 1, low: 1 })
  })

  it('hasActiveFilters ignora el orden', () => {
    expect(hasActiveFilters({ q: '', status: 'all', stock: 'all', sort: 'price-asc' })).toBe(false)
    expect(hasActiveFilters({ q: ' x ' })).toBe(true)
    expect(hasActiveFilters({ cat: 'c1' })).toBe(true)
  })
})
