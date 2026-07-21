import { describe, it, expect } from 'vitest'
import { parseExcelRows, matchImagesToProducts, normalizeKey, fileBaseKey } from '../bulkParse.js'

const HEADERS = ['Producto', 'Categoría', 'Descripción', 'Presentación', 'Precio', 'Imagen']

describe('parseExcelRows', () => {
  it('agrupa presentaciones por producto y toma la imagen de la primera fila que la declare', () => {
    const rows = [
      HEADERS,
      ['Tiro al blanco', 'Infantiles', '', 'Unidad',   2500,  'tiro.jpg'],
      ['Tiro al blanco', 'Infantiles', '', 'Pack x12', 25000, ''],
      ['Bengala',        'Infantiles', '', 'Unidad',   1500,  ''],
      ['Bengala',        'Infantiles', '', 'Pack x10', 12000, 'bengala.png'],
    ]
    const out = parseExcelRows(rows)
    expect(out).toHaveLength(2)
    expect(out[0]).toMatchObject({ name: 'Tiro al blanco', category: 'Infantiles', image: 'tiro.jpg' })
    expect(out[0].presentations).toEqual([{ label: 'Unidad', price: 2500 }, { label: 'Pack x12', price: 25000 }])
    expect(out[1].image).toBe('bengala.png')
  })

  it('acepta la plantilla sin columna Imagen (retrocompatible)', () => {
    const rows = [
      ['Producto', 'Categoría', 'Descripción', 'Presentación', 'Precio'],
      ['Volcán', 'Truenos', '', 'Unidad', 3000],
    ]
    const out = parseExcelRows(rows)
    expect(out).toHaveLength(1)
    expect(out[0].image).toBeUndefined()
    expect(out[0].presentations).toEqual([{ label: 'Unidad', price: 3000 }])
  })

  it('reconoce encabezados alternativos Foto/Image', () => {
    const rows = [
      ['Producto', 'Presentación', 'Precio', 'Foto'],
      ['Volcán', 'Unidad', 3000, 'volcan.webp'],
    ]
    expect(parseExcelRows(rows)[0].image).toBe('volcan.webp')
  })

  it('parsea precios con formato colombiano ($2.500)', () => {
    const rows = [
      ['Producto', 'Presentación', 'Precio'],
      ['Volcán', 'Unidad', '$2.500'],
    ]
    expect(parseExcelRows(rows)[0].presentations[0].price).toBe(2500)
  })

  it('ignora filas sin nombre, sin presentación o con precio inválido', () => {
    const rows = [
      ['Producto', 'Presentación', 'Precio'],
      ['', 'Unidad', 1000],
      ['Volcán', '', 1000],
      ['Volcán', 'Unidad', 'abc'],
      ['Volcán', 'Unidad', 3000],
    ]
    const out = parseExcelRows(rows)
    expect(out).toHaveLength(1)
    expect(out[0].presentations).toHaveLength(1)
  })

  it('exige columnas mínimas', () => {
    expect(() => parseExcelRows([['Nombre', 'Precio'], ['x', 1]])).toThrow(/Presentación/)
  })
})

describe('normalizeKey / fileBaseKey', () => {
  it('normaliza tildes, separadores y mayúsculas', () => {
    expect(normalizeKey('Castillo Pirotécnico')).toBe('castillo pirotecnico')
    expect(fileBaseKey('CASTILLO_pirotecnico.JPG')).toBe('castillo pirotecnico')
    expect(fileBaseKey('bengala-colores.webp')).toBe('bengala colores')
  })
})

describe('matchImagesToProducts', () => {
  const products = parseExcelRows([
    HEADERS,
    ['Tiro al blanco',       'Infantiles',  '', 'Unidad',  2500,  'tiro.jpg'],
    ['Castillo Pirotécnico', 'Profesional', '', 'Pequeño', 35000, ''],
    ['Bengala colores',      'Infantiles',  '', 'Unidad',  1500,  'FOTO-BENGALA.png'],
  ])

  it('empareja por columna Imagen (exacto y sin extensión, sin distinguir mayúsculas)', () => {
    const files = [{ name: 'tiro.jpg' }, { name: 'foto_bengala.PNG' }]
    const { assignments, unmatchedFiles } = matchImagesToProducts(products, files)
    expect(assignments.get(products[0])).toBe(files[0])
    expect(assignments.get(products[2])).toBe(files[1])
    expect(unmatchedFiles).toHaveLength(0)
  })

  it('empareja por nombre de producto cuando no hay columna Imagen', () => {
    const files = [{ name: 'castillo_pirotecnico.webp' }]
    const { assignments } = matchImagesToProducts(products, files)
    expect(assignments.get(products[1])).toBe(files[0])
  })

  it('reporta archivos sin coincidencia', () => {
    const files = [{ name: 'desconocido.jpg' }]
    const { assignments, unmatchedFiles } = matchImagesToProducts(products, files)
    expect(assignments.size).toBe(0)
    expect(unmatchedFiles).toEqual(files)
  })

  it('no asigna dos archivos al mismo producto (gana la columna Imagen)', () => {
    const files = [{ name: 'tiro.jpg' }, { name: 'tiro al blanco.png' }]
    const { assignments, unmatchedFiles } = matchImagesToProducts(products, files)
    expect(assignments.get(products[0])).toBe(files[0])
    expect(unmatchedFiles).toEqual([files[1]])
  })

  it('permite que varios productos compartan el mismo archivo', () => {
    const shared = parseExcelRows([
      HEADERS,
      ['Volcán chico',  'Truenos', '', 'Unidad', 3000, 'volcan.jpg'],
      ['Volcán grande', 'Truenos', '', 'Unidad', 8000, 'volcan.jpg'],
    ])
    const files = [{ name: 'volcan.jpg' }]
    const { assignments, unmatchedFiles } = matchImagesToProducts(shared, files)
    expect(assignments.get(shared[0])).toBe(files[0])
    expect(assignments.get(shared[1])).toBe(files[0])
    expect(unmatchedFiles).toHaveLength(0)
  })
})
