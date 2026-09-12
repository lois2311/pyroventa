import { describe, it, expect } from 'vitest'
import { buildScope, resolveLocation, locationInScope } from '../scope.js'

const NORTE = 'loc-norte', SUR = 'loc-sur'

describe('buildScope', () => {
  it('owner: todos los puntos de la empresa, ignora seller_locations', () => {
    expect(buildScope('owner', [], [NORTE, SUR])).toEqual({ all: true, locationIds: [NORTE, SUR] })
  })
  it('no-owner: solo sus puntos asignados', () => {
    expect(buildScope('admin', [NORTE], [NORTE, SUR])).toEqual({ all: false, locationIds: [NORTE] })
  })
})

describe('resolveLocation', () => {
  const owner = buildScope('owner', [], [NORTE, SUR])
  const adminNorte = buildScope('admin', [NORTE], [])
  const multi = buildScope('seller', [NORTE, SUR], [])
  const none = buildScope('seller', [], [])

  it('owner sin punto y allowAll → consolidado (null)', () => {
    expect(resolveLocation(owner, null, { allowAll: true })).toEqual({ ok: true, locationId: null })
  })
  it('owner sin punto y sin allowAll → 400', () => {
    expect(resolveLocation(owner, null)).toMatchObject({ ok: false, status: 400 })
  })
  it('owner con punto de su empresa → ese punto', () => {
    expect(resolveLocation(owner, SUR)).toEqual({ ok: true, locationId: SUR })
  })
  it('owner con punto de otra empresa → 403', () => {
    expect(resolveLocation(owner, 'loc-ajena')).toMatchObject({ ok: false, status: 403 })
  })
  it('admin Norte pidiendo Sur → 403', () => {
    expect(resolveLocation(adminNorte, SUR, { allowAll: true })).toMatchObject({ ok: false, status: 403 })
  })
  it('admin Norte sin punto → Norte, NUNCA null aunque allowAll', () => {
    expect(resolveLocation(adminNorte, null, { allowAll: true })).toEqual({ ok: true, locationId: NORTE })
    expect(resolveLocation(adminNorte, undefined)).toEqual({ ok: true, locationId: NORTE })
  })
  it('usuario con varios puntos sin elegir → 400', () => {
    expect(resolveLocation(multi, null, { allowAll: true })).toMatchObject({ ok: false, status: 400 })
  })
  it('usuario sin puntos → 403', () => {
    expect(resolveLocation(none, null)).toMatchObject({ ok: false, status: 403 })
  })
  it('scope ausente → 403', () => {
    expect(resolveLocation(undefined, NORTE)).toMatchObject({ ok: false, status: 403 })
  })
})

describe('locationInScope', () => {
  it('verifica pertenencia', () => {
    const s = buildScope('admin', [NORTE], [])
    expect(locationInScope(s, NORTE)).toBe(true)
    expect(locationInScope(s, SUR)).toBe(false)
    expect(locationInScope(s, null)).toBe(false)
  })
})
