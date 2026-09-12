import { supabaseAdmin } from './supabaseAdmin.js'
import { verifyJwt } from './jwt.js'
import { getTenantStatus } from './tenantStatus.js'
import { buildScope } from './scope.js'
import { can } from './roles.js'

function extractToken(req) {
  const authHeader = req.headers['authorization'] || req.headers['Authorization'] || ''
  return authHeader.replace(/^Bearer\s+/i, '').trim()
}

/**
 * Requiere JWT válido de un usuario de tenant.
 * Rol y puntos de venta se leen de la BD en cada petición: un cambio de rol
 * o de asignación aplica de inmediato aunque el token siga vigente.
 */
export async function requireAuth(req, res) {
  const token = extractToken(req)
  if (!token) {
    res.status(401).json({ error: 'Token no proporcionado' })
    return null
  }

  let claims
  try {
    claims = await verifyJwt(token)
  } catch {
    res.status(401).json({ error: 'Token inválido o expirado' })
    return null
  }

  const { tenantId, sellerId, locationId } = claims
  if (!tenantId || !sellerId) {
    res.status(401).json({ error: 'Token inválido' })
    return null
  }

  const [sellerRes, tenantRes] = await Promise.all([
    supabaseAdmin.from('sellers')
      .select('id, name, role, active, seller_locations(location_id)')
      .eq('id', sellerId).eq('tenant_id', tenantId).eq('active', true)
      .single(),
    supabaseAdmin.from('tenants')
      .select('id, name, slug, active, license_start, license_end')
      .eq('id', tenantId)
      .single(),
  ])

  if (sellerRes.error || !sellerRes.data) {
    res.status(401).json({ error: 'Usuario inactivo o no existe' })
    return null
  }

  const status = getTenantStatus(tenantRes.data)
  if (!status.ok) {
    res.status(403).json({ error: status.message, code: status.code })
    return null
  }

  const { seller_locations, ...seller } = sellerRes.data
  let tenantLocationIds = []
  if (seller.role === 'owner') {
    const { data: locs } = await supabaseAdmin.from('locations').select('id').eq('tenant_id', tenantId)
    tenantLocationIds = (locs || []).map(l => l.id)
  }
  const scope = buildScope(seller.role, (seller_locations || []).map(sl => sl.location_id), tenantLocationIds)

  return { seller, tenant: tenantRes.data, tenantId, locationId, scope }
}

/** Requiere que el rol del usuario permita `action` (ver roles.js). */
export async function requireCan(req, res, action) {
  const auth = await requireAuth(req, res)
  if (!auth) return null
  if (!can(auth.seller.role, action)) {
    res.status(403).json({ error: 'No tienes permiso para esta acción' })
    return null
  }
  return auth
}

/** Requiere JWT de super admin (sin consulta a BD). */
export async function requireSuperAdmin(req, res) {
  const token = extractToken(req)
  if (!token) {
    res.status(401).json({ error: 'Token no proporcionado' })
    return null
  }
  try {
    const claims = await verifyJwt(token)
    if (claims.role !== 'super_admin' || !claims.superAdminId) throw new Error()
    return { superAdminId: claims.superAdminId }
  } catch {
    res.status(401).json({ error: 'No autorizado' })
    return null
  }
}
