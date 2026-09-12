// =====================================================
// PyroVenta — Roles fijos y qué puede hacer cada uno.
// Lo importan tanto la API como el frontend: no usar APIs de Node aquí.
// =====================================================

export const ROLES = ['seller', 'cashier', 'admin', 'owner']

export const ROLE_LABELS = {
  seller:  'Vendedor',
  cashier: 'Cajero',
  admin:   'Administrador',
  owner:   'Superadministrador',
}

const STAFF   = ['seller', 'cashier', 'admin', 'owner']
const CASHIER = ['cashier', 'admin', 'owner']
const ADMIN   = ['admin', 'owner']
const OWNER   = ['owner']

const ACTIONS = {
  sell:              STAFF,    // crear ventas (el cajero también vende)
  charge:            CASHIER,  // cobrar, cancelar y editar facturas pendientes
  refund:            CASHIER,
  cash_session:      CASHIER,  // cierre de caja
  view_reports:      ADMIN,    // reportes e historial del punto
  manage_staff:      ADMIN,    // usuarios (el admin: vendedores y cajeros de su punto)
  manage_registers:  ADMIN,
  configure_printer: ADMIN,
  manage_admins:     OWNER,
  manage_catalog:    OWNER,
  manage_locations:  OWNER,
  view_consolidated: OWNER,
}

export function can(role, action) {
  return !!ACTIONS[action]?.includes(role)
}

/** Roles que `actorRole` puede asignar al crear o editar usuarios. */
export function assignableRoles(actorRole) {
  if (actorRole === 'owner') return [...ROLES]
  if (actorRole === 'admin') return ['seller', 'cashier']
  return []
}
