// =====================================================
// PyroVenta — Alcance por punto de venta.
// El alcance sale de la BD en cada petición (requireAuth), nunca del body.
// =====================================================

/**
 * @param {string} role
 * @param {string[]} sellerLocationIds  puntos asignados en seller_locations
 * @param {string[]} tenantLocationIds  todos los puntos de la empresa (solo se usa para owner)
 */
export function buildScope(role, sellerLocationIds, tenantLocationIds) {
  return role === 'owner'
    ? { all: true, locationIds: [...tenantLocationIds] }
    : { all: false, locationIds: [...sellerLocationIds] }
}

const deny = (status, error) => ({ ok: false, status, error })

/**
 * Punto de venta efectivo de una petición.
 * Solo el owner con allowAll puede recibir null (= consolidado de la empresa).
 */
export function resolveLocation(scope, requested, { allowAll = false } = {}) {
  const ids = scope?.locationIds || []
  if (requested) {
    return ids.includes(requested)
      ? { ok: true, locationId: requested }
      : deny(403, 'No tienes acceso a ese punto de venta')
  }
  if (scope?.all) {
    return allowAll ? { ok: true, locationId: null } : deny(400, 'location_id requerido')
  }
  if (ids.length === 1) return { ok: true, locationId: ids[0] }
  if (ids.length === 0) return deny(403, 'No tienes puntos de venta asignados')
  return deny(400, 'location_id requerido')
}

export function locationInScope(scope, locationId) {
  return !!locationId && !!scope?.locationIds?.includes(locationId)
}
