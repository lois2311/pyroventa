import { supabaseAdmin } from './_lib/supabaseAdmin.js'
import { handleCors }    from './_lib/cors.js'
import { requireAuth, requireAdmin } from './_lib/auth.js'
import { signToken }       from './_lib/jwt.js'
import { getTenantStatus } from './_lib/tenantStatus.js'
import { superLogin, superTenantsList, superTenantsCreate, superTenantsPatch, superTenantAdminCreate, superMetrics } from './_lib/superRoutes.js'

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
  if (segments[0] === 'public' && segments[1] === 'tenant' && segments[2] && method === 'GET') {
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

  const { data: tenant } = await supabaseAdmin
    .from('tenants')
    .select('id, name, slug, active, license_start, license_end')
    .eq('slug', String(tenant_slug).toLowerCase().trim())
    .single()

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
  const { data: tenant } = await supabaseAdmin
    .from('tenants')
    .select('id, name, slug, active, license_start, license_end')
    .eq('slug', String(slug).toLowerCase())
    .single()

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
  // private: la respuesta es por tenant — NUNCA cachear en CDN compartido
  res.setHeader('Cache-Control', 'private, max-age=300')
  return res.status(200).json(result)
}

async function productsCreate(req, res) {
  const auth = await requireAdmin(req, res); if (!auth) return
  const { name, category_id, description, presentations = [] } = req.body || {}
  if (!name) return res.status(400).json({ error: 'El nombre es requerido' })
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
  const { location_id, date, status, seller_id, limit = '50', offset = '0' } = req.query
  const day = date ? new Date(date) : new Date(); day.setHours(0,0,0,0)
  const dayEnd = new Date(day); dayEnd.setDate(dayEnd.getDate() + 1)
  let q = supabaseAdmin.from('invoices')
    .select('id, code, location_id, location_name, seller_id, seller_name, total, status, pay_method, items, observations, edited_at, edited_by, register_name, cashier_name, created_at, paid_at', { count: 'exact' })
    .eq('tenant_id', auth.tenantId)
    .gte('created_at', day.toISOString()).lt('created_at', dayEnd.toISOString()).order('created_at', { ascending: false })
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
  const { location_id, date } = req.query
  const day = date ? new Date(date) : new Date(); day.setHours(0,0,0,0)
  const dayEnd = new Date(day); dayEnd.setDate(dayEnd.getDate() + 1)
  let q = supabaseAdmin.from('invoices').select('id, total, pay_method, status, seller_id, seller_name, location_id, location_name, items, created_at')
    .eq('tenant_id', auth.tenantId)
    .gte('created_at', day.toISOString()).lt('created_at', dayEnd.toISOString())
  if (location_id) q = q.eq('location_id', location_id)
  const { data, error } = await q
  if (error) return res.status(500).json({ error: error.message })
  const all = data || [], paid = all.filter(i => i.status === 'paid')
  const tr = paid.reduce((s, i) => s + (i.total || 0), 0), ic = paid.length
  const bpm = { cash: 0, transfer: 0, card: 0 }
  paid.forEach(i => { if (i.pay_method) bpm[i.pay_method] += i.total || 0 })
  const bl = {}
  if (!location_id) paid.forEach(i => { if (!bl[i.location_id]) bl[i.location_id] = { name: i.location_name, total: 0, count: 0 }; bl[i.location_id].total += i.total || 0; bl[i.location_id].count++ })
  return res.status(200).json({ date: day.toISOString().split('T')[0], location_id: location_id || null, total_revenue: tr, invoice_count: ic, avg_ticket: ic > 0 ? tr / ic : 0, pending_count: all.filter(i => i.status === 'pending').length, cancelled_count: all.filter(i => i.status === 'cancelled').length, by_pay_method: bpm, by_location: Object.entries(bl).map(([id, v]) => ({ id, ...v })) })
}

async function reportSellers(req, res) {
  const auth = await requireAuth(req, res); if (!auth) return
  const { location_id, date } = req.query
  const day = date ? new Date(date) : new Date(); day.setHours(0,0,0,0)
  const dayEnd = new Date(day); dayEnd.setDate(dayEnd.getDate() + 1)
  let q = supabaseAdmin.from('invoices').select('seller_id, seller_name, total, status, pay_method')
    .eq('tenant_id', auth.tenantId)
    .gte('created_at', day.toISOString()).lt('created_at', dayEnd.toISOString()).eq('status', 'paid')
  if (location_id) q = q.eq('location_id', location_id)
  const { data, error } = await q
  if (error) return res.status(500).json({ error: error.message })
  const m = {}
  ;(data || []).forEach(inv => { const k = inv.seller_id; if (!m[k]) m[k] = { seller_id: k, seller_name: inv.seller_name || 'Desconocido', total: 0, count: 0, by_method: { cash: 0, transfer: 0, card: 0 } }; m[k].total += inv.total || 0; m[k].count++; if (inv.pay_method) m[k].by_method[inv.pay_method] += inv.total || 0 })
  return res.status(200).json(Object.values(m).map(s => ({ ...s, avg_ticket: s.count > 0 ? s.total / s.count : 0 })).sort((a, b) => b.total - a.total))
}

async function reportLocations(req, res) {
  const auth = await requireAuth(req, res); if (!auth) return
  const { date } = req.query
  const day = date ? new Date(date) : new Date(); day.setHours(0,0,0,0)
  const dayEnd = new Date(day); dayEnd.setDate(dayEnd.getDate() + 1)
  const { data: locs } = await supabaseAdmin.from('locations').select('id, name, address').eq('tenant_id', auth.tenantId).eq('active', true)
  const { data: invs, error } = await supabaseAdmin.from('invoices').select('location_id, total, status, pay_method').eq('tenant_id', auth.tenantId).gte('created_at', day.toISOString()).lt('created_at', dayEnd.toISOString())
  if (error) return res.status(500).json({ error: error.message })
  const lm = {}; (locs || []).forEach(l => { lm[l.id] = { location_id: l.id, location_name: l.name, address: l.address, total_revenue: 0, invoice_count: 0, pending_count: 0, cancelled_count: 0, avg_ticket: 0, by_pay_method: { cash: 0, transfer: 0, card: 0 } } })
  ;(invs || []).forEach(i => { const l = lm[i.location_id]; if (!l) return; if (i.status === 'paid') { l.total_revenue += i.total || 0; l.invoice_count++; if (i.pay_method) l.by_pay_method[i.pay_method] += i.total || 0 }; if (i.status === 'pending') l.pending_count++; if (i.status === 'cancelled') l.cancelled_count++ })
  return res.status(200).json(Object.values(lm).map(l => ({ ...l, avg_ticket: l.invoice_count > 0 ? l.total_revenue / l.invoice_count : 0 })).sort((a, b) => b.total_revenue - a.total_revenue))
}

async function reportRegisters(req, res) {
  const auth = await requireAuth(req, res); if (!auth) return
  const { location_id, date } = req.query
  const day = date ? new Date(date) : new Date(); day.setHours(0,0,0,0)
  const dayEnd = new Date(day); dayEnd.setDate(dayEnd.getDate() + 1)
  let q = supabaseAdmin.from('invoices').select('register_id, register_name, cashier_id, cashier_name, total, pay_method, status')
    .eq('tenant_id', auth.tenantId)
    .gte('created_at', day.toISOString()).lt('created_at', dayEnd.toISOString()).eq('status', 'paid')
  if (location_id) q = q.eq('location_id', location_id)
  const { data, error } = await q
  if (error) return res.status(500).json({ error: error.message })
  const m = {}
  ;(data || []).forEach(inv => { const k = inv.register_id || 'sin_caja'; if (!m[k]) m[k] = { register_id: inv.register_id, register_name: inv.register_name || 'Sin caja', cashier_name: null, total: 0, count: 0, by_method: { cash: 0, transfer: 0, card: 0 } }; m[k].total += inv.total || 0; m[k].count++; if (inv.pay_method) m[k].by_method[inv.pay_method] += inv.total || 0; if (inv.cashier_name) m[k].cashier_name = inv.cashier_name })
  return res.status(200).json(Object.values(m).map(r => ({ ...r, avg_ticket: r.count > 0 ? r.total / r.count : 0 })).sort((a, b) => b.total - a.total))
}

async function reportSellerDetail(req, res) {
  const auth = await requireAuth(req, res); if (!auth) return
  const { seller_id, date, location_id } = req.query
  if (!seller_id) return res.status(400).json({ error: 'seller_id requerido' })
  const day = date ? new Date(date) : new Date(); day.setHours(0,0,0,0)
  const dayEnd = new Date(day); dayEnd.setDate(dayEnd.getDate() + 1)
  const { data: seller } = await supabaseAdmin.from('sellers').select('id, name, role').eq('id', seller_id).eq('tenant_id', auth.tenantId).single()
  let q = supabaseAdmin.from('invoices').select('id, code, location_id, location_name, total, status, pay_method, items, created_at, paid_at').eq('tenant_id', auth.tenantId).eq('seller_id', seller_id).gte('created_at', day.toISOString()).lt('created_at', dayEnd.toISOString()).order('created_at', { ascending: false })
  if (location_id) q = q.eq('location_id', location_id)
  const { data: invoices, error } = await q
  if (error) return res.status(500).json({ error: error.message })
  const all = invoices || [], paid = all.filter(i => i.status === 'paid')
  const tr = paid.reduce((s, i) => s + (i.total || 0), 0)
  const bpm = { cash: 0, transfer: 0, card: 0 }; paid.forEach(i => { if (i.pay_method) bpm[i.pay_method] += i.total || 0 })
  const bh = {}; paid.forEach(inv => { const h = `${String(new Date(inv.created_at).getHours()).padStart(2, '0')}:00`; if (!bh[h]) bh[h] = { hour: h, count: 0, revenue: 0 }; bh[h].count++; bh[h].revenue += inv.total || 0 })
  const pm = {}; paid.forEach(inv => { (Array.isArray(inv.items) ? inv.items : []).forEach(item => { const k = item.product_name || item.label || '?'; if (!pm[k]) pm[k] = { name: k, qty: 0, revenue: 0 }; pm[k].qty += item.qty || 0; pm[k].revenue += item.subtotal || 0 }) })
  return res.status(200).json({ seller: seller || { id: seller_id, name: 'Desconocido' }, date: day.toISOString().split('T')[0], summary: { total_revenue: tr, invoice_count: paid.length, avg_ticket: paid.length > 0 ? tr / paid.length : 0, pending_count: all.filter(i => i.status === 'pending').length, cancelled_count: all.filter(i => i.status === 'cancelled').length, by_pay_method: bpm }, by_hour: Object.values(bh).sort((a, b) => a.hour.localeCompare(b.hour)), top_products: Object.values(pm).sort((a, b) => b.revenue - a.revenue).slice(0, 10), invoices: all })
}

async function reportTopProducts(req, res) {
  const auth = await requireAuth(req, res); if (!auth) return
  const { location_id, date, limit = '10' } = req.query
  const day = date ? new Date(date) : new Date(); day.setHours(0,0,0,0)
  const dayEnd = new Date(day); dayEnd.setDate(dayEnd.getDate() + 1)
  let q = supabaseAdmin.from('invoices').select('items').eq('tenant_id', auth.tenantId).gte('created_at', day.toISOString()).lt('created_at', dayEnd.toISOString()).eq('status', 'paid')
  if (location_id) q = q.eq('location_id', location_id)
  const { data, error } = await q
  if (error) return res.status(500).json({ error: error.message })
  const pm = {}
  ;(data || []).forEach(inv => { (Array.isArray(inv.items) ? inv.items : []).forEach(item => { const k = item.productId || item.product_name || item.label; if (!pm[k]) pm[k] = { product_id: item.productId || null, product_name: item.product_name || item.label || '?', total_qty: 0, total_revenue: 0, presentations: {} }; pm[k].total_qty += item.qty || 0; pm[k].total_revenue += item.subtotal || 0; const pk = item.label || 'Unidad'; if (!pm[k].presentations[pk]) pm[k].presentations[pk] = { qty: 0, revenue: 0 }; pm[k].presentations[pk].qty += item.qty || 0; pm[k].presentations[pk].revenue += item.subtotal || 0 }) })
  return res.status(200).json(Object.values(pm).map(p => ({ ...p, presentations: Object.entries(p.presentations).map(([l, v]) => ({ label: l, ...v })) })).sort((a, b) => b.total_revenue - a.total_revenue).slice(0, parseInt(limit)))
}
