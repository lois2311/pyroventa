// =====================================================
// PyroVenta — Roles fijos y qué puede hacer cada uno.
// Lo importan tanto la API como el frontend: no usar APIs de Node aquí.
// =====================================================

export const ROLES = ['seller', 'cashier', 'admin', 'owner', 'driver']

export const ROLE_LABELS = {
  seller:  'Vendedor',
  cashier: 'Cajero',
  admin:   'Administrador',
  owner:   'Superadministrador',
  driver:  'Domiciliario',
}

// El domiciliario (Vendra Pedidos) NO está en STAFF: no vende ni cobra.
const STAFF   = ['seller', 'cashier', 'admin', 'owner']
const CASHIER = ['cashier', 'admin', 'owner']
const ADMIN   = ['admin', 'owner']
const OWNER   = ['owner']
const DRIVER_OR_ADMIN = ['driver', 'admin', 'owner']

const ACTIONS = {
  sell:              STAFF,    // crear ventas (el cajero también vende)
  charge:            CASHIER,  // cobrar, cancelar y editar facturas pendientes
  refund:            CASHIER,
  cash_session:      CASHIER,  // cierre de caja
  view_reports:      ADMIN,    // reportes e historial del punto
  restock:           ADMIN,    // reponer y registrar mermas de inventario en su punto
  view_stock_audit:  ADMIN,    // historial de movimientos de stock (el admin, solo su punto)
  manage_staff:      ADMIN,    // usuarios (el admin: vendedores y cajeros de su punto)
  manage_registers:  ADMIN,
  configure_printer: ADMIN,
  manage_admins:     OWNER,
  manage_catalog:    OWNER,
  manage_locations:  OWNER,
  view_consolidated: OWNER,
  // Vendra Pedidos
  manage_orders:        CASHIER,         // aceptar/rechazar solicitudes, verificar pagos
  manage_conversations: CASHIER,         // bandeja de WhatsApp
  manage_deliveries:    ADMIN,           // asignar domiciliarios
  manage_connect:       ADMIN,           // canal WhatsApp y configuración de pedidos
  update_delivery:      DRIVER_OR_ADMIN, // cambiar estado de una entrega (el driver, solo las suyas)
}

export function can(role, action) {
  return !!ACTIONS[action]?.includes(role)
}

/** Roles que `actorRole` puede asignar al crear o editar usuarios. */
export function assignableRoles(actorRole) {
  // ponytail: 'driver' aún no se asigna: falta su login (decisión pendiente: cuenta Vendra vs credencial limitada)
  if (actorRole === 'owner') return ROLES.filter(r => r !== 'driver')
  if (actorRole === 'admin') return ['seller', 'cashier']
  return []
}
