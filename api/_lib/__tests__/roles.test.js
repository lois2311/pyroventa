import { describe, it, expect } from 'vitest'
import { can, assignableRoles, ROLES, ROLE_LABELS } from '../roles.js'

describe('can', () => {
  it('vendedor vende pero no cobra ni ve reportes', () => {
    expect(can('seller', 'sell')).toBe(true)
    expect(can('seller', 'charge')).toBe(false)
    expect(can('seller', 'view_reports')).toBe(false)
  })

  it('cajero vende y cobra, sin administración', () => {
    expect(can('cashier', 'sell')).toBe(true)
    expect(can('cashier', 'charge')).toBe(true)
    expect(can('cashier', 'refund')).toBe(true)
    expect(can('cashier', 'cash_session')).toBe(true)
    expect(can('cashier', 'manage_staff')).toBe(false)
  })

  it('admin administra su punto pero no catálogo, puntos, admins ni consolidado', () => {
    for (const a of ['sell', 'charge', 'view_reports', 'manage_staff', 'manage_registers', 'configure_printer']) {
      expect(can('admin', a)).toBe(true)
    }
    for (const a of ['manage_admins', 'manage_catalog', 'manage_locations', 'view_consolidated']) {
      expect(can('admin', a)).toBe(false)
    }
  })

  it('owner puede todo', () => {
    for (const a of ['sell', 'charge', 'manage_admins', 'manage_catalog', 'manage_locations', 'view_consolidated']) {
      expect(can('owner', a)).toBe(true)
    }
  })

  it('rol o acción desconocidos → false', () => {
    expect(can('hacker', 'sell')).toBe(false)
    expect(can('owner', 'borrar_todo')).toBe(false)
    expect(can(undefined, 'sell')).toBe(false)
  })
})

describe('assignableRoles', () => {
  it('owner asigna los cuatro roles', () => {
    expect(assignableRoles('owner')).toEqual(['seller', 'cashier', 'admin', 'owner'])
  })
  it('admin solo vendedor y cajero', () => {
    expect(assignableRoles('admin')).toEqual(['seller', 'cashier'])
  })
  it('cajero y vendedor nada', () => {
    expect(assignableRoles('cashier')).toEqual([])
    expect(assignableRoles('seller')).toEqual([])
  })
})

describe('ROLE_LABELS', () => {
  it('tiene etiqueta para cada rol', () => {
    expect(ROLES.every(r => typeof ROLE_LABELS[r] === 'string')).toBe(true)
    expect(ROLE_LABELS.owner).toBe('Superadministrador')
  })
})
