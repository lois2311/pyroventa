import { describe, it, expect } from 'vitest'
import { slugify } from '../slug.js'

describe('slugify', () => {
  it('convierte a kebab-case sin acentos', () => {
    expect(slugify('Pirotécnica El Cohetón')).toBe('pirotecnica-el-coheton')
  })
  it('elimina caracteres especiales', () => {
    expect(slugify('¡Chispas & Truenos S.A.S.!')).toBe('chispas-truenos-s-a-s')
  })
  it('recorta a 40 caracteres', () => {
    expect(slugify('a'.repeat(60)).length).toBeLessThanOrEqual(40)
  })
  it('string vacío → vacío', () => {
    expect(slugify('')).toBe('')
  })
})
