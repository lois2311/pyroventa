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

describe('Vendra Pedidos', () => {
  it('el domiciliario no vende, cobra ni administra pedidos', () => {
    for (const a of ['sell', 'charge', 'refund', 'manage_orders', 'manage_deliveries', 'manage_connect']) {
      expect(can('driver', a)).toBe(false)
    }
    expect(can('driver', 'update_delivery')).toBe(true)
  })
  it('permisos de pedidos por rol', () => {
    expect(can('seller', 'manage_orders')).toBe(false)
    expect(can('cashier', 'manage_orders')).toBe(true)
    expect(can('cashier', 'manage_deliveries')).toBe(false)
    expect(can('admin', 'manage_connect')).toBe(true)
  })
})

describe('assignableRoles', () => {
  it('owner asigna todos los roles, incluido el domiciliario (entra con PIN)', () => {
    expect(assignableRoles('owner')).toEqual(['seller', 'cashier', 'admin', 'owner', 'driver'])
  })
  it('admin: vendedor, cajero y domiciliario de su punto', () => {
    expect(assignableRoles('admin')).toEqual(['seller', 'cashier', 'driver'])
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
