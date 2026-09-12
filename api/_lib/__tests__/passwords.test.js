import { describe, it, expect } from 'vitest'
import { normalizeUsername, validateUsername, validatePassword, hashPassword, verifyPassword, MIN_PASSWORD } from '../passwords.js'

describe('usuario', () => {
  it('normaliza a minúsculas sin espacios', () => {
    expect(normalizeUsername('  Laura.Admin ')).toBe('laura.admin')
  })
  it('acepta letras, números, punto, guion y guion bajo (3-32)', () => {
    expect(validateUsername('admin-norte_1')).toEqual({ ok: true, username: 'admin-norte_1' })
  })
  it('rechaza cortos, largos, espacios y símbolos', () => {
    for (const u of ['ab', 'a'.repeat(33), 'laura admin', 'laura@x', '', undefined]) {
      expect(validateUsername(u).ok).toBe(false)
    }
  })
})

describe('contraseña', () => {
  it(`exige al menos ${MIN_PASSWORD} caracteres`, () => {
    expect(validatePassword('123456789').ok).toBe(false)
    expect(validatePassword('1234567890').ok).toBe(true)
    expect(validatePassword(undefined).ok).toBe(false)
  })
  it('hash verificable y distinto del texto', () => {
    const h = hashPassword('clave-segura-1')
    expect(h).not.toContain('clave-segura-1')
    expect(verifyPassword('clave-segura-1', h)).toBe(true)
    expect(verifyPassword('otra-clave-99', h)).toBe(false)
  })
  it('sin hash guardado siempre falla', () => {
    expect(verifyPassword('pyroventa-dummy', null)).toBe(false)
  })
})
