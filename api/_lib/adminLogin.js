import { supabaseAdmin } from './supabaseAdmin.js'
import { signToken } from './jwt.js'
import { getTenantStatus } from './tenantStatus.js'
import { normalizeUsername, verifyPassword } from './passwords.js'
import { clientIp, rejectIfLocked, recordFailedAttempt, clearAttempts } from './loginLock.js'

// =====================================================
// PyroVenta — Ingreso administrativo (admin de punto y superadministrador)
// =====================================================

export const ADMIN_SESSION = '8h'

export async function adminLogin(req, res) {
  const { tenant_slug, username, password } = req.body || {}
  if (!tenant_slug || !username || !password) {
    return res.status(400).json({ error: 'Empresa, usuario y contraseña son requeridos' })
  }

  const { data: tenant, error: tenantErr } = await supabaseAdmin
    .from('tenants').select('id, name, slug, active, license_start, license_end')
    .eq('slug', String(tenant_slug).toLowerCase().trim()).single()
  if (tenantErr && tenantErr.code !== 'PGRST116') return res.status(500).json({ error: 'Error interno del servidor' })
  const status = getTenantStatus(tenant)
  if (!status.ok) {
    return res.status(status.code === 'TENANT_NOT_FOUND' ? 404 : 403).json({ error: status.message, code: status.code })
  }

  const uname = normalizeUsername(username)
  const lockKey = `admin:${tenant.id}:${uname}:${clientIp(req)}`
  if (await rejectIfLocked(supabaseAdmin, lockKey, res)) return

  const { data: user } = await supabaseAdmin.from('sellers')
    .select('id, name, role, password_hash, seller_locations(location_id)')
    .eq('tenant_id', tenant.id).eq('username', uname).eq('active', true)
    .in('role', ['admin', 'owner'])
    .maybeSingle()

  const valid = verifyPassword(password, user?.password_hash)
  if (!user || !valid) {
    await recordFailedAttempt(supabaseAdmin, lockKey)
    return res.status(401).json({ error: 'Usuario o contraseña incorrectos' })
  }
  await clearAttempts(supabaseAdmin, lockKey)

  let q = supabaseAdmin.from('locations')
    .select('id, name, address, printer_config')
    .eq('tenant_id', tenant.id).eq('active', true).order('name')
  if (user.role !== 'owner') q = q.in('id', (user.seller_locations || []).map(sl => sl.location_id))
  const { data: locations, error: locErr } = await q
  if (locErr) return res.status(500).json({ error: 'Error interno del servidor' })
  if (!locations?.length) {
    return res.status(403).json({ error: 'No tienes puntos de venta activos asignados' })
  }

  const token = await signToken({ tenantId: tenant.id, sellerId: user.id, role: user.role, kind: 'admin' }, ADMIN_SESSION)
  return res.status(200).json({
    seller: { id: user.id, name: user.name, role: user.role },
    tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug },
    locations,
    token,
  })
}
