import { supabaseAdmin } from '../supabaseAdmin.js'
import { getTenantStatus } from '../tenantStatus.js'
import { clientIp, rejectIfLocked, recordFailedAttempt, clearAttempts } from '../loginLock.js'
import { signToken } from '../jwt.js'

export async function authLogin(req, res) {
  const { pin, location_id, tenant_slug } = req.body || {}
  if (!pin || !location_id || !tenant_slug) {
    return res.status(400).json({ error: 'PIN, punto de venta y empresa son requeridos' })
  }

  const { data: tenant, error: tenantErr } = await supabaseAdmin
    .from('tenants')
    .select('id, name, slug, active, license_start, license_end, has_inventory')
    .eq('slug', String(tenant_slug).toLowerCase().trim())
    .single()

  if (tenantErr && tenantErr.code !== 'PGRST116') {
    return res.status(500).json({ error: 'Error interno del servidor' })
  }

  const status = getTenantStatus(tenant)
  if (!status.ok) {
    const httpCode = status.code === 'TENANT_NOT_FOUND' ? 404 : 403
    return res.status(httpCode).json({ error: status.message, code: status.code })
  }

  // Anti fuerza bruta: un PIN de 4 dígitos son solo 10.000 combinaciones
  const lockKey = `pin:${tenant.id}:${clientIp(req)}`
  if (await rejectIfLocked(supabaseAdmin, lockKey, res)) return

  // Solo vendedores y cajeros entran con PIN; admin y owner usan /auth/admin-login
  const { data: sellers, error } = await supabaseAdmin
    .from('sellers')
    .select('id, name, role, active, seller_locations!inner(location_id)')
    .eq('tenant_id', tenant.id)
    .eq('pin', pin).eq('active', true).in('role', ['seller', 'cashier'])
    .eq('seller_locations.location_id', location_id)

  if (error) return res.status(500).json({ error: 'Error interno del servidor' })
  const seller = sellers?.[0]

  if (!seller) {
    await recordFailedAttempt(supabaseAdmin, lockKey)
    return res.status(401).json({ error: 'PIN incorrecto o no autorizado para este punto de venta' })
  }
  await clearAttempts(supabaseAdmin, lockKey)

  const { data: location, error: locErr } = await supabaseAdmin
    .from('locations').select('id, name, address, printer_config')
    .eq('id', location_id).eq('tenant_id', tenant.id).eq('active', true).single()

  if (locErr || !location) return res.status(404).json({ error: 'Punto de venta no encontrado' })

  const token = await signToken({
    tenantId: tenant.id, sellerId: seller.id, locationId: location_id, role: seller.role,
  })

  return res.status(200).json({
    seller:   { id: seller.id, name: seller.name, role: seller.role },
    location: { id: location.id, name: location.name, address: location.address, printer_config: location.printer_config },
    tenant:   { id: tenant.id, name: tenant.name, slug: tenant.slug, has_inventory: Boolean(tenant.has_inventory) },
    token,
  })
}

export async function publicTenantGet(req, res, slug) {
  const { data: tenant, error: tenantErr } = await supabaseAdmin
    .from('tenants')
    .select('id, name, slug, active, license_start, license_end, has_inventory')
    .eq('slug', String(slug).toLowerCase())
    .single()

  if (tenantErr && tenantErr.code !== 'PGRST116') {
    return res.status(500).json({ error: 'Error interno del servidor' })
  }

  const status = getTenantStatus(tenant)
  if (!status.ok) {
    const httpCode = status.code === 'TENANT_NOT_FOUND' ? 404 : 403
    return res.status(httpCode).json({ error: status.message, code: status.code })
  }

  const { data: locations, error } = await supabaseAdmin
    .from('locations')
    .select('id, name, address, printer_config')
    .eq('tenant_id', tenant.id).eq('active', true)
    .order('name')

  if (error) return res.status(500).json({ error: error.message })

  return res.status(200).json({
    tenant:    { id: tenant.id, name: tenant.name, slug: tenant.slug, has_inventory: Boolean(tenant.has_inventory) },
    locations: locations || [],
  })
}
