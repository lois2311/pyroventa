import { describe, it, expect } from 'vitest'
import { checkUserChange } from '../userRules.js'

const NORTE = 'loc-norte', SUR = 'loc-sur'
const owner      = { id: 'u-owner', role: 'owner', locationIds: [NORTE, SUR] }
const adminNorte = { id: 'u-an', role: 'admin', locationIds: [NORTE] }
const cashier    = { id: 'u-c', role: 'cashier', locationIds: [NORTE] }

const user = (over = {}) => ({
  id: 'u-x', role: 'seller', active: true, username: null, hasPassword: false, hasPin: true, locationIds: [NORTE], ...over,
})

describe('crear', () => {
  it('admin crea vendedor en su punto (puntos por defecto = los suyos)', () => {
    const r = checkUserChange({ actor: adminNorte, target: null, patch: { name: 'Ana', pin: '1234' } })
    expect(r).toEqual({ ok: true, role: 'seller', locationIds: [NORTE] })
  })
  it('admin NO crea vendedor en Sur', () => {
    const r = checkUserChange({ actor: adminNorte, target: null, patch: { name: 'Ana', pin: '1234', location_ids: [SUR] } })
    expect(r).toMatchObject({ ok: false, status: 403 })
  })
  it('admin NO crea admin ni owner', () => {
    for (const role of ['admin', 'owner']) {
      const r = checkUserChange({ actor: adminNorte, target: null, patch: { name: 'X', role, username: 'xadmin', password: '1234567890' } })
      expect(r).toMatchObject({ ok: false, status: 403 })
    }
  })
  it('cajero no crea a nadie', () => {
    const r = checkUserChange({ actor: cashier, target: null, patch: { name: 'X', pin: '1234' } })
    expect(r).toMatchObject({ ok: false, status: 403 })
  })
  it('owner crea admin con exactamente un punto', () => {
    const ok = checkUserChange({ actor: owner, target: null, patch: { role: 'admin', username: 'admin.sur', password: '1234567890', location_ids: [SUR] } })
    expect(ok).toEqual({ ok: true, role: 'admin', locationIds: [SUR] })
    const dos = checkUserChange({ actor: owner, target: null, patch: { role: 'admin', username: 'admin.sur', password: '1234567890', location_ids: [NORTE, SUR] } })
    expect(dos).toMatchObject({ ok: false, status: 400 })
    const cero = checkUserChange({ actor: owner, target: null, patch: { role: 'admin', username: 'admin.sur', password: '1234567890' } })
    expect(cero).toMatchObject({ ok: false, status: 400 })
  })
  it('owner crea owner sin puntos aunque mande location_ids', () => {
    const r = checkUserChange({ actor: owner, target: null, patch: { role: 'owner', username: 'julian', password: '1234567890', location_ids: [NORTE] } })
    expect(r).toEqual({ ok: true, role: 'owner', locationIds: [] })
  })
  it('valida credenciales según rol', () => {
    expect(checkUserChange({ actor: adminNorte, target: null, patch: { name: 'A', pin: '12' } })).toMatchObject({ ok: false, status: 400 })
    expect(checkUserChange({ actor: owner, target: null, patch: { role: 'admin', username: 'ab', password: '1234567890', location_ids: [NORTE] } })).toMatchObject({ ok: false, status: 400 })
    expect(checkUserChange({ actor: owner, target: null, patch: { role: 'admin', username: 'admin.n', password: 'corta', location_ids: [NORTE] } })).toMatchObject({ ok: false, status: 400 })
  })
  it('vendedor sin puntos → 400 (owner no tiene puntos por defecto)', () => {
    const r = checkUserChange({ actor: owner, target: null, patch: { name: 'A', pin: '1234' } })
    expect(r).toMatchObject({ ok: false, status: 400 })
  })
})

describe('editar', () => {
  it('admin edita el nombre de un cajero de su punto sin tocar credenciales', () => {
    const r = checkUserChange({ actor: adminNorte, target: user({ role: 'cashier' }), patch: { name: 'Nuevo' } })
    expect(r).toEqual({ ok: true, role: 'cashier', locationIds: undefined })
  })
  it('admin no edita usuario que también trabaja en Sur', () => {
    const r = checkUserChange({ actor: adminNorte, target: user({ locationIds: [NORTE, SUR] }), patch: { name: 'X' } })
    expect(r).toMatchObject({ ok: false, status: 403 })
  })
  it('admin no edita un usuario sin punto asignado (solo el superadministrador puede)', () => {
    const sinPunto = user({ locationIds: [] })
    const r = checkUserChange({ actor: adminNorte, target: sinPunto, patch: { name: 'X' } })
    expect(r).toMatchObject({ ok: false, status: 403 })
  })
  it('admin no edita otro admin ni un owner', () => {
    const otroAdmin = user({ id: 'u-as', role: 'admin', username: 'admin.s', hasPassword: true, hasPin: false })
    expect(checkUserChange({ actor: adminNorte, target: otroAdmin, patch: { name: 'X' } })).toMatchObject({ ok: false, status: 403 })
    const unOwner = user({ id: 'u-o', role: 'owner', username: 'laura', hasPassword: true, hasPin: false, locationIds: [] })
    expect(checkUserChange({ actor: adminNorte, target: unOwner, patch: { active: false } })).toMatchObject({ ok: false, status: 403 })
  })
  it('admin no se asciende a owner a sí mismo', () => {
    const yo = user({ id: adminNorte.id, role: 'admin', username: 'admin.n', hasPassword: true, hasPin: false })
    expect(checkUserChange({ actor: adminNorte, target: yo, patch: { role: 'owner' } })).toMatchObject({ ok: false, status: 403 })
  })
  it('nadie cambia su propio rol, puntos o estado; sí su nombre y contraseña', () => {
    const yo = user({ id: owner.id, role: 'owner', username: 'laura', hasPassword: true, hasPin: false, locationIds: [] })
    expect(checkUserChange({ actor: owner, target: yo, patch: { role: 'admin' }, activeOwnerCount: 2 })).toMatchObject({ ok: false, status: 403 })
    expect(checkUserChange({ actor: owner, target: yo, patch: { active: false }, activeOwnerCount: 2 })).toMatchObject({ ok: false, status: 403 })
    expect(checkUserChange({ actor: owner, target: yo, patch: { name: 'Laura M', password: 'otra-clave-10' } })).toMatchObject({ ok: true })
  })
  it('no se desactiva ni degrada al último owner activo', () => {
    const otro = user({ id: 'u-o2', role: 'owner', username: 'julian', hasPassword: true, hasPin: false, locationIds: [] })
    expect(checkUserChange({ actor: owner, target: otro, patch: { active: false }, activeOwnerCount: 1 })).toMatchObject({ ok: false, status: 409 })
    expect(checkUserChange({ actor: owner, target: otro, patch: { active: false }, activeOwnerCount: 2 })).toMatchObject({ ok: true })
  })
  it('ascender vendedor a admin exige usuario, contraseña y un solo punto', () => {
    const v = user()
    expect(checkUserChange({ actor: owner, target: v, patch: { role: 'admin' } })).toMatchObject({ ok: false, status: 400 })
    expect(checkUserChange({ actor: owner, target: v, patch: { role: 'admin', username: 'admin.n', password: '1234567890' } }))
      .toEqual({ ok: true, role: 'admin', locationIds: undefined })
  })
  it('degradar owner a cajero exige PIN y puntos', () => {
    const o = user({ id: 'u-o2', role: 'owner', username: 'julian', hasPassword: true, hasPin: false, locationIds: [] })
    expect(checkUserChange({ actor: owner, target: o, patch: { role: 'cashier', pin: '4321' }, activeOwnerCount: 2 })).toMatchObject({ ok: false, status: 400 })
    expect(checkUserChange({ actor: owner, target: o, patch: { role: 'cashier', pin: '4321', location_ids: [SUR] }, activeOwnerCount: 2 }))
      .toEqual({ ok: true, role: 'cashier', locationIds: [SUR] })
  })
})
