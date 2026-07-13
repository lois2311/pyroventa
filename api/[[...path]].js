import { supabaseAdmin } from './_lib/supabaseAdmin.js'
import { handleCors }    from './_lib/cors.js'
import { requireAuth, requireAdmin } from './_lib/auth.js'
import { signToken }       from './_lib/jwt.js'
import { getTenantStatus } from './_lib/tenantStatus.js'
import { superLogin, superTenantsList, superTenantsCreate, superTenantsPatch, superTenantAdminCreate, superMetrics } from './_lib/superRoutes.js'
import { parseRange, bogotaDayBounds } from './_lib/range.js'
import { tenantOwns } from './_lib/tenantOwns.js'

// =====================================================
// PyroVenta — API Router (catch-all)
// Consolida todas las rutas en una sola serverless function
// para mantenerse dentro del límite de 12 del plan Hobby de Vercel.
// =====================================================

export default async function handler(req, res) {
  if (handleCors(req, res)) return

  // Extraer segmentos de ruta desde la URL (más confiable que req.query.path en Vercel)
  const url = req.url || ''
  const apiPath = url.split('?')[0].replace(/^\/api\/?/, '') // quitar /api/ del inicio
  const segments = apiPath.split('/').filter(Boolean)
  const route = '/' + segments.join('/')
  const method = req.method

  // ---- AUTH -----------------------------------------
  if (route === '/auth/login' && method === 'POST') return authLogin(req, res)

  // ---- PÚBLICO (bootstrap de login por empresa) -----
  if (segments[0] === 'public' && segments[1] === 'tenant' && segments[2] && segments.length === 3 && method === 'GET') {
    return publicTenantGet(req, res, segments[2])
  }

  // ---- SUPER ADMIN ----------------------------------
  if (route === '/auth/super/login' && method === 'POST') return superLogin(req, res)
  if (route === '/super/tenants' && method === 'GET')     return superTenantsList(req, res)
  if (route === '/super/tenants' && method === 'POST')    return superTenantsCreate(req, res)
  if (segments[0] === 'super' && segments[1] === 'tenants' && segments[2] && !segments[3] && method === 'PATCH') {
    return superTenantsPatch(req, res, segments[2])
  }
  if (segments[0] === 'super' && segments[1] === 'tenants' && segments[2] && segments[3] === 'admin' && method === 'POST') {
    return superTenantAdminCreate(req, res, segments[2])
  }
  if (route === '/super/metrics' && method === 'GET')     return superMetrics(req, res)

  // ---- LOCATIONS ------------------------------------
  if (route === '/locations' && method === 'GET')  return locationsGet(req, res)
  if (route === '/locations' && method === 'POST') return locationsCreate(req, res)
  if (segments[0] === 'locations' && segments[1] && method === 'PUT')    return locationsUpdate(req, res, segments[1])
  if (segments[0] === 'locations' && segments[1] && method === 'DELETE') return locationsDelete(req, res, segments[1])

  // ---- PRODUCTS -------------------------------------
  if (route === '/products' && method === 'GET')   return productsGet(req, res)
  if (route === '/products' && method === 'POST')  return productsCreate(req, res)
  if (route === '/products/bulk' && method === 'POST') return productsBulk(req, res)
  if (segments[0] === 'products' && segments[1] && segments[1] !== 'bulk' && method === 'PUT')    return productsUpdate(req, res, segments[1])
  if (segments[0] === 'products' && segments[1] && segments[1] !== 'bulk' && method === 'DELETE') return productsDelete(req, res, segments[1])

  // ---- SELLERS --------------------------------------
  if (route === '/sellers' && method === 'GET')  return sellersGet(req, res)
  if (route === '/sellers' && method === 'POST') return sellersCreate(req, res)
  if (segments[0] === 'sellers' && segments[1] && method === 'PUT')    return sellersUpdate(req, res, segments[1])
  if (segments[0] === 'sellers' && segments[1] && method === 'DELETE') return sellersDelete(req, res, segments[1])

  // ---- REGISTERS ------------------------------------
  if (route === '/registers' && method === 'GET')  return registersGet(req, res)
  if (route === '/registers' && method === 'POST') return registersCreate(req, res)
  if (segments[0] === 'registers' && segments[1] && method === 'PUT')    return registersUpdate(req, res, segments[1])
  if (segments[0] === 'registers' && segments[1] && method === 'DELETE') return registersDelete(req, res, segments[1])

  // ---- INVOICES -------------------------------------
  if (route === '/invoices' && method === 'POST') return invoicesCreate(req, res)
  if (route === '/invoices/pending' && method === 'GET') return invoicesPending(req, res)
  if (route === '/invoices/history' && method === 'GET') return invoicesHistory(req, res)
  // /invoices/:code/pay, /invoices/:code/cancel, /invoices/:code/edit
  if (segments[0] === 'invoices' && segments[1] && segments[2] === 'pay'    && method === 'POST') return invoicesPay(req, res, segments[1])
  if (segments[0] === 'invoices' && segments[1] && segments[2] === 'cancel' && method === 'POST') return invoicesCancel(req, res, segments[1])
  if (segments[0] === 'invoices' && segments[1] && segments[2] === 'edit'   && method === 'POST') return invoicesEdit(req, res, segments[1])
  // /invoices/:code (GET)
  if (segments[0] === 'invoices' && segments[1] && !segments[2] && method === 'GET') return invoicesGetByCode(req, res, segments[1])

  // ---- REPORTS --------------------------------------
  if (route === '/reports/daily'         && method === 'GET') return reportDaily(req, res)
  if (route === '/reports/sellers'       && method === 'GET') return reportSellers(req, res)
  if (route === '/reports/locations'     && method === 'GET') return reportLocations(req, res)
  if (route === '/reports/registers'     && method === 'GET') return reportRegisters(req, res)
  if (route === '/reports/seller-detail' && method === 'GET') return reportSellerDetail(req, res)
  if (route === '/reports/register-detail' && method === 'GET') return reportRegisterDetail(req, res)
  if (route === '/reports/top-products'  && method === 'GET') return reportTopProducts(req, res)

  return res.status(404).json({ error: `Ruta no encontrada: ${method} /api${route}` })
}

// =====================================================
// AUTH
// =====================================================
async function authLogin(req, res) {
  const { pin, location_id, tenant_slug } = req.body || {}
  if (!pin || !location_id || !tenant_slug) {
    return res.status(400).json({ error: 'PIN, punto de venta y empresa son requeridos' })
  }

  const { data: tenant, error: tenantErr } = await supabaseAdmin
    .from('tenants')
    .select('id, name, slug, active, license_start, license_end')
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

  const { data: sellers, error } = await supabaseAdmin
    .from('sellers')
    .select('id, name, pin, role, active, seller_locations!inner(location_id)')
    .eq('tenant_id', tenant.id)
    .eq('pin', pin).eq('active', true).eq('seller_locations.location_id', location_id)

  if (error) return res.status(500).json({ error: 'Error interno del servidor' })
  let seller = sellers?.[0]

  // Los admin del tenant entran a cualquier punto de venta sin asignación explícita
  if (!seller) {
    const { data: admins } = await supabaseAdmin
      .from('sellers').select('id, name, pin, role, active')
      .eq('tenant_id', tenant.id)
      .eq('pin', pin).eq('role', 'admin').eq('active', true).limit(1)
    seller = admins?.[0]
  }

  if (!seller) return res.status(401).json({ error: 'PIN incorrecto o no autorizado para este punto de venta' })

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
    tenant:   { id: tenant.id, name: tenant.name, slug: tenant.slug },
    token,
  })
}

// =====================================================
// PÚBLICO — bootstrap de login por slug de empresa
// =====================================================
async function publicTenantGet(req, res, slug) {
  const { data: tenant, error: tenantErr } = await supabaseAdmin
    .from('tenants')
    .select('id, name, slug, active, license_start, license_end')
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
    tenant:    { id: tenant.id, name: tenant.name, slug: tenant.slug },
    locations: locations || [],
  })
}

// =====================================================
// LOCATIONS
// =====================================================
async function locationsGet(req, res) {
  const auth = await requireAuth(req, res); if (!auth) return
  const { data, error } = await supabaseAdmin.from('locations')
    .select('id, name, address, printer_config, active')
    .eq('tenant_id', auth.tenantId).order('name')
  if (error) return res.status(500).json({ error: error.message })
  return res.status(200).json(data)
}

async function locationsCreate(req, res) {
  const auth = await requireAdmin(req, res); if (!auth) return
  const { name, address, printer_config } = req.body || {}
  if (!name) return res.status(400).json({ error: 'El nombre es requerido' })
  const defaultConfig = { printer_name: 'POS-80', paper_width: '80mm', chars_per_line: 48, header_lines: [auth.tenant.name.toUpperCase(), address || ''], footer_lines: ['¡Gracias por su compra!', 'Manipule con responsabilidad'], use_qz_tray: false }
  const { data, error } = await supabaseAdmin.from('locations')
    .insert({ tenant_id: auth.tenantId, name, address, printer_config: printer_config || defaultConfig })
    .select().single()
  if (error) return res.status(500).json({ error: error.message })
  return res.status(201).json(data)
}

async function locationsUpdate(req, res, id) {
  const auth = await requireAdmin(req, res); if (!auth) return
  const { name, address, printer_config, active } = req.body || {}
  const u = {}
  if (name !== undefined)           u.name = name
  if (address !== undefined)        u.address = address
  if (printer_config !== undefined) u.printer_config = printer_config
  if (active !== undefined)         u.active = active
  const { data, error } = await supabaseAdmin.from('locations')
    .update(u).eq('id', id).eq('tenant_id', auth.tenantId).select().single()
  if (error) return res.status(500).json({ error: error.message })
  return res.status(200).json(data)
}

async function locationsDelete(req, res, id) {
  const auth = await requireAdmin(req, res); if (!auth) return
  await supabaseAdmin.from('locations').update({ active: false }).eq('id', id).eq('tenant_id', auth.tenantId)
  return res.status(204).end()
}

// =====================================================
// PRODUCTS
// =====================================================
async function productsGet(req, res) {
  const auth = await requireAuth(req, res); if (!auth) return
  const { location_id } = req.query
  const { data: products, error } = await supabaseAdmin.from('products')
    .select('id, name, description, active, categories(id, name, icon, sort_order), presentations(id, label, price, active)')
    .eq('tenant_id', auth.tenantId).eq('active', true).order('name')
  if (error) return res.status(500).json({ error: error.message })
  let result = products.map(p => ({ ...p, presentations: (p.presentations || []).filter(pr => pr.active) }))
  if (location_id) {
    const { data: stockRows } = await supabaseAdmin.from('stock')
      .select('product_id, quantity').eq('location_id', location_id).eq('tenant_id', auth.tenantId)
    const sm = {}; (stockRows || []).forEach(s => { sm[s.product_id] = s.quantity })
    result = result.map(p => ({ ...p, stock_quantity: sm[p.id] ?? 0 }))
  }
  result.sort((a, b) => (a.categories?.sort_order ?? 99) - (b.categories?.sort_order ?? 99) || a.name.localeCompare(b.name, 'es'))
  // Respuesta por-tenant en URL compartida: private evita CDNs compartidos y
  // Vary: Authorization separa las entradas por token (HTTP y Cache API del SW).
  // Cualquier endpoint /api futuro con max-age > 0 debe replicar este par.
  // private: la respuesta es por tenant — NUNCA cachear en CDN compartido
  res.setHeader('Cache-Control', 'private, max-age=300')
  res.setHeader('Vary', 'Authorization')
  return res.status(200).json(result)
}

async function productsCreate(req, res) {
  const auth = await requireAdmin(req, res); if (!auth) return
  const { name, category_id, description, presentations = [] } = req.body || {}
  if (!name) return res.status(400).json({ error: 'El nombre es requerido' })
  if (!(await tenantOwns('categories', category_id, auth.tenantId))) return res.status(403).json({ error: 'Referencia inválida para esta empresa' })
  const { data: product, error: pe } = await supabaseAdmin.from('products')
    .insert({ tenant_id: auth.tenantId, name, category_id, description }).select().single()
  if (pe) return res.status(500).json({ error: pe.message })
  if (presentations.length > 0) {
    await supabaseAdmin.from('presentations')
      .insert(presentations.map(p => ({ tenant_id: auth.tenantId, product_id: product.id, label: p.label, price: p.price })))
  }
  const { data: full } = await supabaseAdmin.from('products')
    .select('*, categories(*), presentations(*)').eq('id', product.id).eq('tenant_id', auth.tenantId).single()
  return res.status(201).json(full)
}

async function productsUpdate(req, res, id) {
  const auth = await requireAdmin(req, res); if (!auth) return
  const { name, category_id, description, active, presentations } = req.body || {}
  if (category_id !== undefined && !(await tenantOwns('categories', category_id, auth.tenantId))) return res.status(403).json({ error: 'Referencia inválida para esta empresa' })
  const u = {}
  if (name !== undefined) u.name = name
  if (category_id !== undefined) u.category_id = category_id
  if (description !== undefined) u.description = description
  if (active !== undefined) u.active = active
  if (Object.keys(u).length > 0) {
    await supabaseAdmin.from('products').update(u).eq('id', id).eq('tenant_id', auth.tenantId)
  }
  if (presentations) {
    await supabaseAdmin.from('presentations').delete().eq('product_id', id).eq('tenant_id', auth.tenantId)
    if (presentations.length > 0) {
      await supabaseAdmin.from('presentations')
        .insert(presentations.map(p => ({ tenant_id: auth.tenantId, product_id: id, label: p.label, price: p.price })))
    }
  }
  const { data: full } = await supabaseAdmin.from('products')
    .select('*, categories(*), presentations(*)').eq('id', id).eq('tenant_id', auth.tenantId).single()
  return res.status(200).json(full)
}

async function productsDelete(req, res, id) {
  const auth = await requireAdmin(req, res); if (!auth) return
  await supabaseAdmin.from('products').update({ active: false }).eq('id', id).eq('tenant_id', auth.tenantId)
  return res.status(204).end()
}

async function productsBulk(req, res) {
  const auth = await requireAdmin(req, res); if (!auth) return
  const { products } = req.body || {}
  if (!Array.isArray(products) || !products.length) return res.status(400).json({ error: 'Se requiere un arreglo de productos' })
  for (let i = 0; i < products.length; i++) {
    const p = products[i]
    if (!p.name?.trim()) return res.status(400).json({ error: `Fila ${i + 1}: nombre requerido` })
    if (!Array.isArray(p.presentations) || !p.presentations.length) return res.status(400).json({ error: `"${p.name}": requiere presentaciones` })
    for (const pres of p.presentations) {
      if (!pres.label?.trim() || !pres.price || isNaN(pres.price) || pres.price <= 0) return res.status(400).json({ error: `"${p.name}": presentación inválida` })
    }
  }
  const catNames = [...new Set(products.map(p => p.category?.trim()).filter(Boolean))]
  const catMap = {}
  if (catNames.length) {
    const { data: ec } = await supabaseAdmin.from('categories').select('id, name').eq('tenant_id', auth.tenantId)
    const em = {}; (ec || []).forEach(c => { em[c.name.toLowerCase()] = c.id })
    for (const cn of catNames) {
      const k = cn.toLowerCase()
      if (em[k]) { catMap[k] = em[k] } else {
        const { data: nc } = await supabaseAdmin.from('categories')
          .insert({ tenant_id: auth.tenantId, name: cn, active: true }).select('id').single()
        if (nc) { catMap[k] = nc.id; em[k] = nc.id }
      }
    }
  }
  const results = { created: 0, skipped: 0, errors: [] }
  for (const p of products) {
    const cid = p.category?.trim() ? catMap[p.category.trim().toLowerCase()] || null : null
    const { data: ex } = await supabaseAdmin.from('products')
      .select('id').eq('tenant_id', auth.tenantId).ilike('name', p.name.trim()).limit(1)
    if (ex?.length) { results.skipped++; continue }
    const { data: np, error: pe } = await supabaseAdmin.from('products')
      .insert({ tenant_id: auth.tenantId, name: p.name.trim(), category_id: cid, description: p.description?.trim() || null, active: true })
      .select('id').single()
    if (pe) { results.errors.push(`"${p.name}": ${pe.message}`); continue }
    const { error: pre } = await supabaseAdmin.from('presentations')
      .insert(p.presentations.map(pr => ({ tenant_id: auth.tenantId, product_id: np.id, label: pr.label.trim(), price: Number(pr.price), active: true })))
    if (pre) { results.errors.push(`"${p.name}" pres: ${pre.message}`); continue }
    results.created++
  }
  return res.status(200).json({ message: `${results.created} creado(s), ${results.skipped} omitido(s)`, ...results })
}

// =====================================================
// SELLERS
// =====================================================
async function sellersGet(req, res) {
  const auth = await requireAdmin(req, res); if (!auth) return
  const { location_id } = req.query
  let q = supabaseAdmin.from('sellers')
    .select('id, name, pin, role, active, created_at, seller_locations(location_id)')
    .eq('tenant_id', auth.tenantId).order('name')
  if (location_id) {
    q = supabaseAdmin.from('sellers')
      .select('id, name, pin, role, active, created_at, seller_locations!inner(location_id)')
      .eq('tenant_id', auth.tenantId).eq('seller_locations.location_id', location_id).order('name')
  }
  const { data, error } = await q
  if (error) return res.status(500).json({ error: error.message })
  return res.status(200).json(data || [])
}

async function sellersCreate(req, res) {
  const auth = await requireAdmin(req, res); if (!auth) return
  const { name, pin, role = 'seller', location_ids = [] } = req.body || {}
  if (!name || !pin) return res.status(400).json({ error: 'name y pin requeridos' })
  if (!/^\d{4}$/.test(pin)) return res.status(400).json({ error: 'PIN debe ser 4 dígitos' })
  const { data: seller, error: se } = await supabaseAdmin.from('sellers')
    .insert({ tenant_id: auth.tenantId, name, pin, role }).select().single()
  if (se) return res.status(500).json({ error: se.message })
  if (location_ids.length) {
    for (const lid of location_ids) {
      if (!(await tenantOwns('locations', lid, auth.tenantId))) return res.status(403).json({ error: 'Referencia inválida para esta empresa' })
    }
    await supabaseAdmin.from('seller_locations')
      .insert(location_ids.map(lid => ({ tenant_id: auth.tenantId, seller_id: seller.id, location_id: lid })))
  }
  return res.status(201).json(seller)
}

async function sellersUpdate(req, res, id) {
  const auth = await requireAdmin(req, res); if (!auth) return
  const { name, pin, role, active, location_ids } = req.body || {}
  const u = {}
  if (name !== undefined) u.name = name
  if (pin !== undefined) { if (!/^\d{4}$/.test(pin)) return res.status(400).json({ error: 'PIN debe ser 4 dígitos' }); u.pin = pin }
  if (role !== undefined) u.role = role
  if (active !== undefined) u.active = active
  if (Object.keys(u).length) await supabaseAdmin.from('sellers').update(u).eq('id', id).eq('tenant_id', auth.tenantId)
  if (Array.isArray(location_ids)) {
    for (const lid of location_ids) {
      if (!(await tenantOwns('locations', lid, auth.tenantId))) return res.status(403).json({ error: 'Referencia inválida para esta empresa' })
    }
    await supabaseAdmin.from('seller_locations').delete().eq('seller_id', id).eq('tenant_id', auth.tenantId)
    if (location_ids.length) {
      await supabaseAdmin.from('seller_locations')
        .insert(location_ids.map(lid => ({ tenant_id: auth.tenantId, seller_id: id, location_id: lid })))
    }
  }
  const { data } = await supabaseAdmin.from('sellers')
    .select('*, seller_locations(location_id)').eq('id', id).eq('tenant_id', auth.tenantId).single()
  return res.status(200).json(data)
}

async function sellersDelete(req, res, id) {
  const auth = await requireAdmin(req, res); if (!auth) return
  await supabaseAdmin.from('sellers').update({ active: false }).eq('id', id).eq('tenant_id', auth.tenantId)
  return res.status(204).end()
}

// =====================================================
// REGISTERS
// =====================================================
async function registersGet(req, res) {
  const auth = await requireAuth(req, res); if (!auth) return
  const { location_id } = req.query
  let q = supabaseAdmin.from('registers')
    .select('id, name, location_id, active, created_at')
    .eq('tenant_id', auth.tenantId).eq('active', true).order('name')
  if (location_id) q = q.eq('location_id', location_id)
  const { data, error } = await q
  if (error) return res.status(500).json({ error: error.message })
  return res.status(200).json(data || [])
}

async function registersCreate(req, res) {
  const auth = await requireAdmin(req, res); if (!auth) return
  const { name, location_id } = req.body || {}
  if (!name?.trim() || !location_id) return res.status(400).json({ error: 'name y location_id requeridos' })
  if (!(await tenantOwns('locations', location_id, auth.tenantId))) return res.status(403).json({ error: 'Referencia inválida para esta empresa' })
  const { data, error } = await supabaseAdmin.from('registers')
    .insert({ tenant_id: auth.tenantId, name: name.trim(), location_id, active: true }).select().single()
  if (error) return res.status(500).json({ error: error.message })
  return res.status(201).json(data)
}

async function registersUpdate(req, res, id) {
  const auth = await requireAdmin(req, res); if (!auth) return
  const { name, active } = req.body || {}
  const u = {}
  if (name !== undefined) u.name = name.trim()
  if (active !== undefined) u.active = active
  const { data, error } = await supabaseAdmin.from('registers')
    .update(u).eq('id', id).eq('tenant_id', auth.tenantId).select().single()
  if (error) return res.status(500).json({ error: error.message })
  return res.status(200).json(data)
}

async function registersDelete(req, res, id) {
  const auth = await requireAdmin(req, res); if (!auth) return
  await supabaseAdmin.from('registers').update({ active: false }).eq('id', id).eq('tenant_id', auth.tenantId)
  return res.status(200).json({ ok: true })
}

// =====================================================
// INVOICES
// =====================================================
async function invoicesCreate(req, res) {
  const auth = await requireAuth(req, res); if (!auth) return
  const { location_id, seller_id, seller_name, location_name, items } = req.body || {}
  if (!location_id || !seller_id || !Array.isArray(items) || !items.length) return res.status(400).json({ error: 'location_id, seller_id e items requeridos' })
  for (const item of items) { if (!item.presentationId || !item.price || !item.qty) return res.status(400).json({ error: 'Item inválido' }) }

  const { data: loc } = await supabaseAdmin.from('locations')
    .select('id').eq('id', location_id).eq('tenant_id', auth.tenantId).single()
  if (!loc) return res.status(403).json({ error: 'Punto de venta no pertenece a esta empresa' })
  if (!(await tenantOwns('sellers', seller_id, auth.tenantId))) return res.status(403).json({ error: 'Referencia inválida para esta empresa' })

  const total = items.reduce((s, i) => s + (i.price * i.qty), 0)
  const { data: code, error: ce } = await supabaseAdmin.rpc('get_next_invoice_code', { p_location_id: location_id })
  if (ce || !code) return res.status(500).json({ error: 'No se pudo generar código' })
  const { data: invoice, error: ie } = await supabaseAdmin.from('invoices')
    .insert({ tenant_id: auth.tenantId, code, location_id, location_name, seller_id, seller_name, total, status: 'pending', items })
    .select().single()
  if (ie) return res.status(500).json({ error: ie.message })
  return res.status(201).json(invoice)
}

async function invoicesPending(req, res) {
  const auth = await requireAuth(req, res); if (!auth) return
  const { location_id } = req.query
  if (!location_id) return res.status(400).json({ error: 'location_id requerido' })
  const { data, error } = await supabaseAdmin.from('invoices')
    .select('id, code, total, items, seller_id, seller_name, location_name, created_at, status, observations, edited_at')
    .eq('tenant_id', auth.tenantId).eq('location_id', location_id).eq('status', 'pending')
    .order('created_at', { ascending: false })
  if (error) return res.status(500).json({ error: error.message })
  return res.status(200).json(data || [])
}

async function invoicesGetByCode(req, res, code) {
  const auth = await requireAuth(req, res); if (!auth) return
  const { location_id } = req.query
  if (!location_id) return res.status(400).json({ error: 'location_id requerido' })
  const { data, error } = await supabaseAdmin.from('invoices')
    .select('*').eq('tenant_id', auth.tenantId).eq('code', code).eq('location_id', location_id).eq('status', 'pending')
    .order('created_at', { ascending: false }).limit(1).single()
  if (error && error.code !== 'PGRST116') return res.status(500).json({ error: error.message })
  if (!data) return res.status(404).json({ error: `No hay factura pendiente con código ${code}` })
  return res.status(200).json(data)
}

async function invoicesPay(req, res, code) {
  const auth = await requireAuth(req, res); if (!auth) return
  const { location_id, pay_method, observations, register_id, register_name } = req.body || {}
  if (!location_id || !pay_method) return res.status(400).json({ error: 'location_id y pay_method requeridos' })
  if (!['cash', 'transfer', 'card'].includes(pay_method)) return res.status(400).json({ error: 'pay_method inválido' })
  const { data, error } = await supabaseAdmin.from('invoices').update({
    status: 'paid', pay_method, paid_at: new Date().toISOString(),
    cashier_id: auth.seller.id, cashier_name: auth.seller.name,
    ...(register_id ? { register_id } : {}), ...(register_name ? { register_name } : {}),
    ...(observations ? { observations } : {}),
  }).eq('tenant_id', auth.tenantId).eq('code', code).eq('location_id', location_id).eq('status', 'pending').select().single()
  if (error) return res.status(500).json({ error: error.message })
  if (!data) return res.status(409).json({ error: 'Factura no existe, ya cobrada o cancelada' })
  return res.status(200).json(data)
}

async function invoicesCancel(req, res, code) {
  const auth = await requireAuth(req, res); if (!auth) return
  const { location_id } = req.body || {}
  if (!location_id) return res.status(400).json({ error: 'location_id requerido' })
  const { data, error } = await supabaseAdmin.from('invoices')
    .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
    .eq('tenant_id', auth.tenantId).eq('code', code).eq('location_id', location_id).eq('status', 'pending').select().single()
  if (error) return res.status(500).json({ error: error.message })
  if (!data) return res.status(409).json({ error: 'Factura no existe, ya cobrada o cancelada' })
  return res.status(200).json(data)
}

async function invoicesEdit(req, res, code) {
  const auth = await requireAuth(req, res); if (!auth) return
  if (!['cashier', 'admin'].includes(auth.seller.role)) return res.status(403).json({ error: 'Solo cajero o admin pueden editar' })
  const { location_id, items, observations } = req.body || {}
  if (!location_id) return res.status(400).json({ error: 'location_id requerido' })
  const { data: existing } = await supabaseAdmin.from('invoices')
    .select('id').eq('tenant_id', auth.tenantId).eq('code', code).eq('location_id', location_id).eq('status', 'pending').single()
  if (!existing) return res.status(404).json({ error: 'Factura pendiente no encontrada' })
  const u = { edited_by: auth.seller.id, edited_at: new Date().toISOString() }
  if (items !== undefined) {
    if (!Array.isArray(items) || !items.length) return res.status(400).json({ error: 'items vacío' })
    const pi = items.map(i => ({ ...i, subtotal: i.price * i.qty }))
    u.items = pi; u.total = pi.reduce((s, i) => s + i.subtotal, 0)
  }
  if (observations !== undefined) u.observations = observations || null
  const { data, error } = await supabaseAdmin.from('invoices')
    .update(u).eq('id', existing.id).eq('status', 'pending').select().single()
  if (error) return res.status(500).json({ error: error.message })
  return res.status(200).json(data)
}

async function invoicesHistory(req, res) {
  const auth = await requireAuth(req, res); if (!auth) return
  const { location_id, status, seller_id, limit = '50', offset = '0' } = req.query
  let range
  try { range = parseRange(req.query) } catch (e) { return res.status(e.status || 400).json({ error: e.message }) }
  const bounds = bogotaDayBounds(range.from, range.to)
  let q = supabaseAdmin.from('invoices')
    .select('id, code, location_id, location_name, seller_id, seller_name, total, status, pay_method, items, observations, edited_at, edited_by, register_name, cashier_name, created_at, paid_at', { count: 'exact' })
    .eq('tenant_id', auth.tenantId)
    .gte('created_at', bounds.start).lt('created_at', bounds.end).order('created_at', { ascending: false })
    .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1)
  if (location_id) q = q.eq('location_id', location_id)
  if (status) q = q.eq('status', status)
  if (seller_id) q = q.eq('seller_id', seller_id)
  const { data, error, count } = await q
  if (error) return res.status(500).json({ error: error.message })
  return res.status(200).json({ invoices: data || [], total: count || 0 })
}

// =====================================================
// REPORTS
// =====================================================
async function reportDaily(req, res) {
  const auth = await requireAuth(req, res); if (!auth) return
  let range
  try { range = parseRange(req.query) } catch (e) { return res.status(e.status || 400).json({ error: e.message }) }
  const { from, to } = range
  const { location_id } = req.query

  const { data: summaryRows, error } = await supabaseAdmin.rpc('report_range_summary', {
    p_tenant_id: auth.tenantId, p_from: from, p_to: to,
    p_location_id: location_id || null,
  })
  if (error) return res.status(500).json({ error: error.message })
  const s = summaryRows?.[0] || {}
  const tr = Number(s.total_revenue || 0), ic = Number(s.invoice_count || 0)

  const result = {
    from, to,
    date: from === to ? from : undefined, // retrocompatibilidad
    location_id: location_id || null,
    total_revenue: tr,
    invoice_count: ic,
    avg_ticket: ic > 0 ? tr / ic : 0,
    pending_count: Number(s.pending_count || 0),
    cancelled_count: Number(s.cancelled_count || 0),
    by_pay_method: { cash: Number(s.cash || 0), transfer: Number(s.transfer || 0), card: Number(s.card || 0) },
    by_day: [],
    by_location: [],
  }

  if (from !== to) {
    const { data: days, error: daysErr } = await supabaseAdmin.rpc('report_range_by_day', {
      p_tenant_id: auth.tenantId, p_from: from, p_to: to,
      p_location_id: location_id || null,
    })
    if (daysErr) return res.status(500).json({ error: daysErr.message })
    result.by_day = (days || []).map(d => ({
      day: d.day,
      total_revenue: Number(d.total_revenue || 0),
      invoice_count: Number(d.invoice_count || 0),
      cash: Number(d.cash || 0), transfer: Number(d.transfer || 0), card: Number(d.card || 0),
    }))
  }

  if (!location_id) {
    const { data: locs, error: locsErr } = await supabaseAdmin.rpc('report_range_by_location', {
      p_tenant_id: auth.tenantId, p_from: from, p_to: to,
    })
    if (locsErr) return res.status(500).json({ error: locsErr.message })
    result.by_location = (locs || []).map(l => ({
      id: l.location_id, name: l.location_name,
      total: Number(l.total_revenue || 0), count: Number(l.invoice_count || 0),
    }))
  }

  return res.status(200).json(result)
}

async function reportSellers(req, res) {
  const auth = await requireAuth(req, res); if (!auth) return
  let range
  try { range = parseRange(req.query) } catch (e) { return res.status(e.status || 400).json({ error: e.message }) }
  const { location_id } = req.query
  const { data, error } = await supabaseAdmin.rpc('report_range_by_seller', {
    p_tenant_id: auth.tenantId, p_from: range.from, p_to: range.to,
    p_location_id: location_id || null,
  })
  if (error) return res.status(500).json({ error: error.message })
  return res.status(200).json((data || []).map(r => {
    const total = Number(r.total_revenue || 0), count = Number(r.invoice_count || 0)
    return {
      seller_id: r.seller_id, seller_name: r.seller_name,
      total, count, avg_ticket: count > 0 ? total / count : 0,
      by_method: { cash: Number(r.cash || 0), transfer: Number(r.transfer || 0), card: Number(r.card || 0) },
    }
  }))
}

async function reportRegisters(req, res) {
  const auth = await requireAuth(req, res); if (!auth) return
  let range
  try { range = parseRange(req.query) } catch (e) { return res.status(e.status || 400).json({ error: e.message }) }
  const { location_id } = req.query
  const { data, error } = await supabaseAdmin.rpc('report_range_by_register', {
    p_tenant_id: auth.tenantId, p_from: range.from, p_to: range.to,
    p_location_id: location_id || null,
  })
  if (error) return res.status(500).json({ error: error.message })
  return res.status(200).json((data || []).map(r => {
    const total = Number(r.total_revenue || 0), count = Number(r.invoice_count || 0)
    return {
      register_id: r.register_id, register_name: r.register_name, cashier_name: r.cashier_name,
      total, count, avg_ticket: count > 0 ? total / count : 0,
      by_method: { cash: Number(r.cash || 0), transfer: Number(r.transfer || 0), card: Number(r.card || 0) },
    }
  }))
}

async function reportLocations(req, res) {
  const auth = await requireAuth(req, res); if (!auth) return
  let range
  try { range = parseRange(req.query) } catch (e) { return res.status(e.status || 400).json({ error: e.message }) }
  const [{ data, error }, { data: locRows, error: locErr }] = await Promise.all([
    supabaseAdmin.rpc('report_range_by_location', {
      p_tenant_id: auth.tenantId, p_from: range.from, p_to: range.to,
    }),
    supabaseAdmin.from('locations').select('id, name, address').eq('tenant_id', auth.tenantId),
  ])
  if (error) return res.status(500).json({ error: error.message })
  if (locErr) return res.status(500).json({ error: locErr.message })
  const addr = {}; (locRows || []).forEach(l => { addr[l.id] = l.address })
  return res.status(200).json((data || []).map(l => {
    const tr = Number(l.total_revenue || 0), ic = Number(l.invoice_count || 0)
    return {
      location_id: l.location_id, location_name: l.location_name, address: addr[l.location_id] || null,
      total_revenue: tr, invoice_count: ic,
      pending_count: Number(l.pending_count || 0), cancelled_count: Number(l.cancelled_count || 0),
      avg_ticket: ic > 0 ? tr / ic : 0,
      by_pay_method: { cash: Number(l.cash || 0), transfer: Number(l.transfer || 0), card: Number(l.card || 0) },
    }
  }))
}

async function reportTopProducts(req, res) {
  const auth = await requireAuth(req, res); if (!auth) return
  let range
  try { range = parseRange(req.query) } catch (e) { return res.status(e.status || 400).json({ error: e.message }) }
  const { location_id, seller_id, register_id, limit = '10' } = req.query
  const { data, error } = await supabaseAdmin.rpc('report_range_products', {
    p_tenant_id: auth.tenantId, p_from: range.from, p_to: range.to,
    p_location_id: location_id || null,
    p_seller_id: seller_id || null,
    p_register_id: register_id || null,
  })
  if (error) return res.status(500).json({ error: error.message })
  // Agrupar filas planas (producto+presentación) al shape anidado existente
  const pm = {}
  ;(data || []).forEach(r => {
    if (!pm[r.product_name]) pm[r.product_name] = { product_id: null, product_name: r.product_name, total_qty: 0, total_revenue: 0, presentations: [] }
    const p = pm[r.product_name]
    p.total_qty += Number(r.total_qty || 0)
    p.total_revenue += Number(r.total_revenue || 0)
    p.presentations.push({ label: r.label, qty: Number(r.total_qty || 0), revenue: Number(r.total_revenue || 0) })
  })
  return res.status(200).json(
    Object.values(pm).sort((a, b) => b.total_revenue - a.total_revenue).slice(0, parseInt(limit))
  )
}

// Detalle común para vendedor y caja: summary + por hora + productos + facturas
async function rangeDetail(auth, { from, to, location_id, seller_id, register_id }) {
  const rpcParams = {
    p_tenant_id: auth.tenantId, p_from: from, p_to: to,
    p_location_id: location_id || null,
    p_seller_id: seller_id || null,
    p_register_id: register_id || null,
  }
  const bounds = bogotaDayBounds(from, to)
  let invQ = supabaseAdmin.from('invoices')
    .select('id, code, location_id, location_name, seller_name, cashier_name, register_name, total, status, pay_method, items, created_at, paid_at')
    .eq('tenant_id', auth.tenantId)
    .gte('created_at', bounds.start).lt('created_at', bounds.end)
    .order('created_at', { ascending: false }).limit(100)
  if (location_id) invQ = invQ.eq('location_id', location_id)
  if (seller_id)   invQ = invQ.eq('seller_id', seller_id)
  if (register_id) invQ = invQ.eq('register_id', register_id)

  const [sum, hours, prods, invs] = await Promise.all([
    supabaseAdmin.rpc('report_range_summary', rpcParams),
    supabaseAdmin.rpc('report_range_by_hour', rpcParams),
    supabaseAdmin.rpc('report_range_products', rpcParams),
    invQ,
  ])
  const failed = [sum, hours, prods, invs].find(r => r.error)
  if (failed) {
    const err = new Error(failed.error.message)
    err.status = 500
    throw err
  }
  const s = sum.data?.[0] || {}
  const tr = Number(s.total_revenue || 0), ic = Number(s.invoice_count || 0)
  return {
    summary: {
      total_revenue: tr, invoice_count: ic,
      avg_ticket: ic > 0 ? tr / ic : 0,
      pending_count: Number(s.pending_count || 0),
      cancelled_count: Number(s.cancelled_count || 0),
      by_pay_method: { cash: Number(s.cash || 0), transfer: Number(s.transfer || 0), card: Number(s.card || 0) },
    },
    by_hour: (hours.data || []).map(h => ({ hour: h.hour, count: Number(h.invoice_count || 0), revenue: Number(h.total_revenue || 0) })),
    top_products: (prods.data || []).slice(0, 10).map(p => ({ name: `${p.product_name}${p.label && p.label !== 'Unidad' ? ` (${p.label})` : ''}`, qty: Number(p.total_qty || 0), revenue: Number(p.total_revenue || 0) })),
    invoices: invs.data || [],
  }
}

async function reportSellerDetail(req, res) {
  const auth = await requireAuth(req, res); if (!auth) return
  const { seller_id, location_id } = req.query
  if (!seller_id) return res.status(400).json({ error: 'seller_id requerido' })
  let range
  try { range = parseRange(req.query) } catch (e) { return res.status(e.status || 400).json({ error: e.message }) }
  const { data: seller } = await supabaseAdmin.from('sellers')
    .select('id, name, role').eq('id', seller_id).eq('tenant_id', auth.tenantId).single()
  let detail
  try { detail = await rangeDetail(auth, { from: range.from, to: range.to, location_id, seller_id }) }
  catch (e) { return res.status(e.status || 500).json({ error: e.message }) }
  return res.status(200).json({
    seller: seller || { id: seller_id, name: 'Desconocido' },
    from: range.from, to: range.to, date: range.from === range.to ? range.from : undefined,
    ...detail,
  })
}

async function reportRegisterDetail(req, res) {
  const auth = await requireAuth(req, res); if (!auth) return
  const { register_id, location_id } = req.query
  if (!register_id) return res.status(400).json({ error: 'register_id requerido' })
  let range
  try { range = parseRange(req.query) } catch (e) { return res.status(e.status || 400).json({ error: e.message }) }
  const { data: register } = await supabaseAdmin.from('registers')
    .select('id, name, location_id').eq('id', register_id).eq('tenant_id', auth.tenantId).single()
  if (!register) return res.status(404).json({ error: 'Caja no encontrada' })
  let detail
  try { detail = await rangeDetail(auth, { from: range.from, to: range.to, location_id, register_id }) }
  catch (e) { return res.status(e.status || 500).json({ error: e.message }) }
  return res.status(200).json({
    register, from: range.from, to: range.to,
    ...detail,
  })
}
