import { supabaseAdmin } from './supabaseAdmin.js'
import { verifyJwt } from './jwt.js'
import { getTenantStatus } from './tenantStatus.js'

function extractToken(req) {
  const authHeader = req.headers['authorization'] || req.headers['Authorization'] || ''
  return authHeader.replace(/^Bearer\s+/i, '').trim()
}

/**
 * Requiere JWT válido de un usuario de tenant.
 * Valida: firma, seller activo en su tenant, tenant activo y con licencia vigente.
 * Responde 401/403 y retorna null si algo falla.
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
      .select('id, name, role, active')
      .eq('id', sellerId).eq('tenant_id', tenantId).eq('active', true)
      .single(),
    supabaseAdmin.from('tenants')
      .select('id, name, slug, active, license_start, license_end')
      .eq('id', tenantId)
      .single(),
  ])

  if (sellerRes.error || !sellerRes.data) {
    res.status(401).json({ error: 'Vendedor inactivo o no existe' })
    return null
  }

  const status = getTenantStatus(tenantRes.data)
  if (!status.ok) {
    res.status(403).json({ error: status.message, code: status.code })
    return null
  }

  return { seller: sellerRes.data, tenant: tenantRes.data, tenantId, locationId }
}

/** Requiere rol admin del tenant. */
export async function requireAdmin(req, res) {
  const auth = await requireAuth(req, res)
  if (!auth) return null
  if (auth.seller.role !== 'admin') {
    res.status(403).json({ error: 'Se requiere rol de administrador' })
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
