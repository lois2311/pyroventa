import { describe, it, expect, beforeAll } from 'vitest'
import { signToken, verifyJwt } from '../jwt.js'

beforeAll(() => { process.env.JWT_SECRET = 'test-secret-para-vitest' })

describe('jwt', () => {
  it('firma y verifica un token con sus claims', async () => {
    const token = await signToken({ tenantId: 't1', sellerId: 's1', locationId: 'l1', role: 'seller' })
    const claims = await verifyJwt(token)
    expect(claims.tenantId).toBe('t1')
    expect(claims.sellerId).toBe('s1')
    expect(claims.role).toBe('seller')
  })

  it('rechaza un token manipulado', async () => {
    const token = await signToken({ tenantId: 't1' })
    const tampered = token.slice(0, -2) + 'xx'
    await expect(verifyJwt(tampered)).rejects.toThrow()
  })

  it('rechaza un token expirado', async () => {
    const token = await signToken({ tenantId: 't1' }, '-10s')
    await expect(verifyJwt(token)).rejects.toThrow()
  })

  it('rechaza un token forjado tipo base64 (formato viejo)', async () => {
    const fake = Buffer.from('seller-id:location-id').toString('base64')
    await expect(verifyJwt(fake)).rejects.toThrow()
  })

  it('expiración por defecto es 7 días', async () => {
    const token = await signToken({ tenantId: 't1' })
    const claims = await verifyJwt(token)
    expect(claims.exp - claims.iat).toBe(7 * 24 * 3600)
  })

  it('rechaza un token sin firma valida aunque declare otro alg', async () => {
    // header {"alg":"none"} + payload sin firma
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url')
    const payload = Buffer.from(JSON.stringify({ tenantId: 't1' })).toString('base64url')
    await expect(verifyJwt(`${header}.${payload}.`)).rejects.toThrow()
  })
})
