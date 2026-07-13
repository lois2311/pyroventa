import bcrypt from 'bcryptjs'
import { supabaseAdmin } from './supabaseAdmin.js'
import { requireSuperAdmin } from './auth.js'
import { signToken } from './jwt.js'
import { getTenantStatus } from './tenantStatus.js'
import { slugify } from './slug.js'

// =====================================================
// PyroVenta — Rutas del super admin (plataforma)
// =====================================================

// Hash dummy para igualar el tiempo de respuesta cuando el email no existe
const DUMMY_HASH = bcrypt.hashSync('pyroventa-dummy', 10)

export async function superLogin(req, res) {
  const { email, password } = req.body || {}
  if (!email || !password) return res.status(400).json({ error: 'Email y contraseña requeridos' })

  const { data: sa } = await supabaseAdmin
    .from('super_admins').select('id, email, password_hash')
    .eq('email', String(email).toLowerCase().trim()).single()

  const hash = sa?.password_hash || DUMMY_HASH
  const valid = bcrypt.compareSync(password, hash)
  if (!sa || !valid) {
    return res.status(401).json({ error: 'Credenciales inválidas' })
  }

  const token = await signToken({ role: 'super_admin', superAdminId: sa.id }, '24h')
  return res.status(200).json({ token, email: sa.email })
}

export async function superTenantsList(req, res) {
  const auth = await requireSuperAdmin(req, res); if (!auth) return

  const { data: tenants, error } = await supabaseAdmin
    .from('tenants').select('*').order('created_at', { ascending: false })
  if (error) return res.status(500).json({ error: error.message })

  const today = new Date(); today.setHours(0, 0, 0, 0)
  const [{ data: todayInvoices }, { data: lastActivity }] = await Promise.all([
    supabaseAdmin.from('invoices').select('tenant_id, total, status').gte('created_at', today.toISOString()),
    supabaseAdmin.rpc('tenant_last_activity'),
  ])

  const sales = {}
  ;(todayInvoices || []).forEach(i => {
    if (i.status !== 'paid') return
    if (!sales[i.tenant_id]) sales[i.tenant_id] = { total: 0, count: 0 }
    sales[i.tenant_id].total += i.total || 0
    sales[i.tenant_id].count++
  })
  const last = {}
  ;(lastActivity || []).forEach(r => { last[r.tenant_id] = r.last_invoice_at })

  return res.status(200).json((tenants || []).map(t => {
    const st = getTenantStatus(t)
    return {
      ...t,
      today_sales:    sales[t.id]?.total || 0,
      today_invoices: sales[t.id]?.count || 0,
      last_activity:  last[t.id] || null,
      status:         st.ok ? 'active' : st.code,
    }
  }))
}

export async function superTenantsCreate(req, res) {
  const auth = await requireSuperAdmin(req, res); if (!auth) return
  const { name, slug: rawSlug, license_start, license_end, admin } = req.body || {}
  if (!name?.trim()) return res.status(400).json({ error: 'El nombre es requerido' })
  if (!license_start || !license_end) return res.status(400).json({ error: 'license_start y license_end son requeridos' })
  if (license_end < license_start) return res.status(400).json({ error: 'license_end debe ser posterior a license_start' })
  if (admin && (!admin.name?.trim() || !/^\d{4}$/.test(admin.pin || ''))) {
    return res.status(400).json({ error: 'El admin inicial requiere nombre y PIN de 4 dígitos' })
  }

  const slug = slugify(rawSlug || name)
  if (!slug) return res.status(400).json({ error: 'No se pudo generar un slug válido' })

  const { data: tenant, error } = await supabaseAdmin
    .from('tenants')
    .insert({ name: name.trim(), slug, active: true, license_start, license_end })
    .select().single()
  if (error) {
    if (error.code === '23505') return res.status(409).json({ error: `El código "${slug}" ya existe — usa otro` })
    return res.status(500).json({ error: error.message })
  }

  if (admin) {
    const { error: se } = await supabaseAdmin.from('sellers')
      .insert({ tenant_id: tenant.id, name: admin.name.trim(), pin: admin.pin, role: 'admin' })
    if (se) return res.status(500).json({ error: `Tenant creado pero falló el admin: ${se.message}` })
  }

  return res.status(201).json({ tenant, link: `/c/${slug}` })
}

export async function superTenantsPatch(req, res, id) {
  const auth = await requireSuperAdmin(req, res); if (!auth) return
  const { name, active, license_start, license_end } = req.body || {}
  const u = {}
  if (name !== undefined)          u.name = name
  if (active !== undefined)        u.active = active
  if (license_start !== undefined) u.license_start = license_start
  if (license_end !== undefined)   u.license_end = license_end
  if (!Object.keys(u).length) return res.status(400).json({ error: 'Nada que actualizar' })
  const { data, error } = await supabaseAdmin.from('tenants').update(u).eq('id', id).select().single()
  if (error) return res.status(500).json({ error: error.message })
  return res.status(200).json(data)
}

export async function superTenantAdminCreate(req, res, tenantId) {
  const auth = await requireSuperAdmin(req, res); if (!auth) return
  const { name, pin } = req.body || {}
  if (!name?.trim() || !/^\d{4}$/.test(pin || '')) {
    return res.status(400).json({ error: 'Nombre y PIN de 4 dígitos requeridos' })
  }
  const { data: tenant } = await supabaseAdmin.from('tenants').select('id').eq('id', tenantId).single()
  if (!tenant) return res.status(404).json({ error: 'Empresa no encontrada' })
  const { data, error } = await supabaseAdmin.from('sellers')
    .insert({ tenant_id: tenantId, name: name.trim(), pin, role: 'admin' })
    .select('id, name, role').single()
  if (error) return res.status(500).json({ error: error.message })
  return res.status(201).json(data)
}

export async function superMetrics(req, res) {
  const auth = await requireSuperAdmin(req, res); if (!auth) return
  const { from, to } = req.query
  const start = from ? new Date(from) : new Date(); start.setHours(0, 0, 0, 0)
  const end = to ? new Date(to) : new Date(start); end.setHours(0, 0, 0, 0)
  end.setDate(end.getDate() + 1)

  const [{ data: tenants }, { data: invoices, error }] = await Promise.all([
    supabaseAdmin.from('tenants').select('id, name'),
    supabaseAdmin.from('invoices').select('tenant_id, total, status')
      .gte('created_at', start.toISOString()).lt('created_at', end.toISOString()).eq('status', 'paid'),
  ])
  if (error) return res.status(500).json({ error: error.message })

  const m = {}
  ;(invoices || []).forEach(i => {
    if (!m[i.tenant_id]) m[i.tenant_id] = { revenue: 0, invoice_count: 0 }
    m[i.tenant_id].revenue += i.total || 0
    m[i.tenant_id].invoice_count++
  })
  return res.status(200).json((tenants || []).map(t => ({
    tenant_id: t.id,
    tenant_name: t.name,
    revenue: m[t.id]?.revenue || 0,
    invoice_count: m[t.id]?.invoice_count || 0,
  })).sort((a, b) => b.revenue - a.revenue))
}
