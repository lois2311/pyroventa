import { describe, it, expect } from 'vitest'
import { createHash } from 'node:crypto'
import { generateSetupToken, hashToken, tokenUsable, TOKEN_RE, SETUP_TTL_HOURS } from '../passwordSetup.js'

describe('generateSetupToken', () => {
  it('genera 64 hex y guarda solo su SHA-256', () => {
    const { token, tokenHash } = generateSetupToken()
    expect(token).toMatch(TOKEN_RE)
    expect(tokenHash).toBe(createHash('sha256').update(token).digest('hex'))
    expect(tokenHash).not.toBe(token)
    expect(tokenHash).toHaveLength(64)
  })

  it('cada token es distinto', () => {
    expect(generateSetupToken().token).not.toBe(generateSetupToken().token)
  })

  it('vence a las 24 horas por defecto', () => {
    const now = Date.UTC(2026, 9, 2, 12)
    const { expiresAt } = generateSetupToken(now)
    expect(new Date(expiresAt).getTime() - now).toBe(SETUP_TTL_HOURS * 3600_000)
  })

  it('hashToken es determinista', () => {
    expect(hashToken('abc')).toBe(hashToken('abc'))
  })
})

describe('tokenUsable', () => {
  const now = Date.UTC(2026, 9, 2, 12)
  const fresh = { used_at: null, revoked_at: null, expires_at: new Date(now + 1000).toISOString() }

  it('acepta un token vigente, sin usar ni revocar', () => {
    expect(tokenUsable(fresh, now)).toBe(true)
  })
  it('rechaza uno inexistente', () => {
    expect(tokenUsable(null, now)).toBe(false)
  })
  it('rechaza reutilizar un token ya usado', () => {
    expect(tokenUsable({ ...fresh, used_at: new Date(now - 1).toISOString() }, now)).toBe(false)
  })
  it('rechaza un token vencido', () => {
    expect(tokenUsable({ ...fresh, expires_at: new Date(now - 1).toISOString() }, now)).toBe(false)
    expect(tokenUsable({ ...fresh, expires_at: new Date(now).toISOString() }, now)).toBe(false)
  })
  it('rechaza un token revocado', () => {
    expect(tokenUsable({ ...fresh, revoked_at: new Date(now - 1).toISOString() }, now)).toBe(false)
  })
})
