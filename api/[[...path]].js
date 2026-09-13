import { supabaseAdmin } from './_lib/supabaseAdmin.js'
import { handleCors }    from './_lib/cors.js'
import { requireAuth, requireCan } from './_lib/auth.js'
import { adminLogin } from './_lib/adminLogin.js'
import { signToken }       from './_lib/jwt.js'
import { getTenantStatus } from './_lib/tenantStatus.js'
import { superLogin, superTenantsList, superTenantsCreate, superTenantsPatch, superTenantAdminCreate, superTenantLocationCreate, superMetrics } from './_lib/superRoutes.js'
import { defaultPrinterConfig } from './_lib/printerConfig.js'
import { parseRange, bogotaDayBounds } from './_lib/range.js'
import { tenantOwns } from './_lib/tenantOwns.js'
import { compareProducts } from './_lib/productSort.js'
import { buildInvoiceItems } from './_lib/invoiceItems.js'
import { parseImageDataUrl, isAllowedImageUrl, imagePathFromUrl, ensureProductImagesBucket, PRODUCT_IMAGES_BUCKET } from './_lib/productImages.js'
import { clientIp, rejectIfLocked, recordFailedAttempt, clearAttempts } from './_lib/loginLock.js'
import { bogotaDate } from './_lib/tenantStatus.js'
import { randomUUID } from 'node:crypto'
import { can } from './_lib/roles.js'
import { resolveLocation, locationInScope } from './_lib/scope.js'
import { checkUserChange } from './_lib/userRules.js'
import { hashPassword, normalizeUsername } from './_lib/passwords.js'

// =====================================================
// PyroVenta — API Router (catch-all)
// Consolida todas las rutas en una sola serverless function
// para mantenerse dentro del límite de 12 del plan Hobby de Vercel.
// =====================================================

export default async function handler(req, res) {
  try {
    return await route(req, res)
  } catch (err) {
    // Excepción no controlada: reportar a Sentry (si está configurado) y responder 500
    const { reportError } = await import('./_lib/sentry.js')
    await reportError(err, { url: req.url, method: req.method })
    if (!res.headersSent) res.status(500).json({ error: 'Error interno del servidor' })
  }
}

async function route(req, res) {
  if (handleCors(req, res)) return

  // Extraer segmentos de ruta desde la URL (más confiable que req.query.path en Vercel)
  const url = req.url || ''
  const apiPath = url.split('?')[0].replace(/^\/api\/?/, '') // quitar /api/ del inicio
  const segments = apiPath.split('/').filter(Boolean)
  const route = '/' + segments.join('/')
  const method = req.method

  // ---- AUTH -----------------------------------------
  if (route === '/auth/login' && method === 'POST') return authLogin(req, res)
  if (route === '/auth/admin-login' && method === 'POST') return adminLogin(req, res)

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
  if (segments[0] === 'super' && segments[1] === 'tenants' && segments[2] && segments[3] === 'locations' && method === 'POST') {
    return superTenantLocationCreate(req, res, segments[2])
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
  if (route === '/products/bulk-delete' && method === 'POST') return productsBulkDelete(req, res)
  if (route === '/products/upload-image' && method === 'POST') return productsUploadImage(req, res)
  if (segments[0] === 'products' && segments[1] && !PRODUCT_SUBROUTES.includes(segments[1]) && method === 'PUT')    return productsUpdate(req, res, segments[1])
  if (segments[0] === 'products' && segments[1] && !PRODUCT_SUBROUTES.includes(segments[1]) && method === 'DELETE') return productsDelete(req, res, segments[1])

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

  // ---- CIERRES DE CAJA ------------------------------
  if (route === '/closures/summary' && method === 'GET')  return closuresSummary(req, res)
  if (route === '/closures' && method === 'GET')          return closuresList(req, res)
  if (route === '/closures' && method === 'POST')         return closuresCreate(req, res)

  // ---- INVOICES -------------------------------------
  if (route === '/invoices' && method === 'POST') return invoicesCreate(req, res)
  if (route === '/invoices/pending' && method === 'GET') return invoicesPending(req, res)
  if (route === '/invoices/history' && method === 'GET') return invoicesHistory(req, res)
  // /invoices/:code/pay, /invoices/:code/cancel, /invoices/:code/edit
  if (segments[0] === 'invoices' && segments[1] && segments[2] === 'pay'    && method === 'POST') return invoicesPay(req, res, segments[1])
  if (segments[0] === 'invoices' && segments[1] && segments[2] === 'cancel' && method === 'POST') return invoicesCancel(req, res, segments[1])
  if (segments[0] === 'invoices' && segments[1] && segments[2] === 'edit'   && method === 'POST') return invoicesEdit(req, res, segments[1])
  // /invoices/:id/refund — por id (el código se recicla entre facturas pagadas)
  if (segments[0] === 'invoices' && segments[1] && segments[2] === 'refund' && method === 'POST') return invoicesRefund(req, res, segments[1])
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
// ALCANCE POR PUNTO DE VENTA
// =====================================================

/**
 * Punto efectivo de la petición. Si no aplica, responde el error y devuelve
 * undefined (el caller debe salir). null solo para owner con allowAll.
 */
function scopedLocation(auth, requested, res, opts) {
  const r = resolveLocation(auth.scope, requested || null, opts)
  if (!r.ok) { res.status(r.status).json({ error: r.error }); return undefined }
  return r.locationId
}

/** true (y responde 403) si el punto no está en el alcance del usuario. */
function denyOutOfScope(auth, locationId, res) {
  if (locationInScope(auth.scope, locationId)) return false
  res.status(403).json({ error: 'No tienes acceso a ese punto de venta' })
  return true
}

/** Caja del tenant dentro del alcance; responde 404/403 y devuelve null si no. */
async function loadScopedRegister(auth, id, res) {
  const { data } = await supabaseAdmin.from('registers')
    .select('id, name, location_id').eq('id', id).eq('tenant_id', auth.tenantId).single()
  if (!data) { res.status(404).json({ error: 'Caja no encontrada' }); return null }
  if (denyOutOfScope(auth, data.location_id, res)) return null
  return data
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
    .eq('tenant_id', auth.tenantId).in('id', auth.scope.locationIds).order('name')
  if (error) return res.status(500).json({ error: error.message })
  return res.status(200).json(data)
}

async function locationsCreate(req, res) {
  const auth = await requireCan(req, res, 'manage_locations'); if (!auth) return
  const { name, address, printer_config } = req.body || {}
  if (!name) return res.status(400).json({ error: 'El nombre es requerido' })
  const { data, error } = await supabaseAdmin.from('locations')
    .insert({ tenant_id: auth.tenantId, name, address, printer_config: printer_config || defaultPrinterConfig(auth.tenant.name, address) })
    .select().single()
  if (error) return res.status(500).json({ error: error.message })
  return res.status(201).json(data)
}

async function locationsUpdate(req, res, id) {
  const auth = await requireCan(req, res, 'configure_printer'); if (!auth) return
  if (denyOutOfScope(auth, id, res)) return
  const { name, address, printer_config, active } = req.body || {}
  // El admin del punto solo ajusta la impresora; nombre, dirección y estado son del superadmin
  if ((name !== undefined || address !== undefined || active !== undefined) && !can(auth.seller.role, 'manage_locations')) {
    return res.status(403).json({ error: 'Solo el superadministrador puede editar los datos del punto de venta' })
  }
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
  const auth = await requireCan(req, res, 'manage_locations'); if (!auth) return
  if (denyOutOfScope(auth, id, res)) return
  await supabaseAdmin.from('locations').update({ active: false }).eq('id', id).eq('tenant_id', auth.tenantId)
  return res.status(204).end()
}

// =====================================================
// PRODUCTS
// =====================================================
// Segmentos de /products/* que son endpoints, no ids de producto
const PRODUCT_SUBROUTES = ['bulk', 'bulk-delete', 'upload-image']

async function productsGet(req, res) {
  const auth = await requireAuth(req, res); if (!auth) return
  const { location_id } = req.query
  if (location_id && denyOutOfScope(auth, location_id, res)) return
  // include_inactive: solo admin — lo usa el panel de borrado masivo, que debe
  // ver también los productos desactivados para poder eliminarlos de verdad.
  const includeInactive = ['1', 'true'].includes(String(req.query.include_inactive || ''))
  if (includeInactive && !can(auth.seller.role, 'manage_catalog')) {
    return res.status(403).json({ error: 'Solo el administrador puede ver productos inactivos' })
  }
  const selectProducts = (withImage) => {
    const q = supabaseAdmin.from('products')
      .select(`id, name, description, ${withImage ? 'image_url, ' : ''}active, categories(id, name, icon, sort_order), presentations(id, label, price, active)`)
      .eq('tenant_id', auth.tenantId)
    return (includeInactive ? q : q.eq('active', true)).order('name')
  }
  let { data: products, error } = await selectProducts(productsHasImageColumn)
  // Fallback pre-migración: si la columna image_url aún no existe, responder sin
  // fotos y recordarlo para no pagar la doble query en cada request de la instancia.
  if (error && productsHasImageColumn && isMissingImageColumn(error)) {
    productsHasImageColumn = false
    ;({ data: products, error } = await selectProducts(false))
  }
  if (error) return res.status(500).json({ error: error.message })
  let result = products.map(p => ({ ...p, presentations: (p.presentations || []).filter(pr => pr.active) }))
  if (location_id) {
    const { data: stockRows } = await supabaseAdmin.from('stock')
      .select('product_id, quantity').eq('location_id', location_id).eq('tenant_id', auth.tenantId)
    const sm = {}; (stockRows || []).forEach(s => { sm[s.product_id] = s.quantity })
    result = result.map(p => ({ ...p, stock_quantity: sm[p.id] ?? 0 }))
  }
  result.sort(compareProducts)
  // Respuesta por-tenant en URL compartida: private evita CDNs compartidos y
  // Vary: Authorization separa las entradas por token (HTTP y Cache API del SW).
  // Cualquier endpoint /api futuro con max-age > 0 debe replicar este par.
  // private: la respuesta es por tenant — NUNCA cachear en CDN compartido
  // include_inactive es una vista de administración: siempre fresca.
  res.setHeader('Cache-Control', includeInactive ? 'private, no-store' : 'private, max-age=300')
  res.setHeader('Vary', 'Authorization')
  return res.status(200).json(result)
}

// Mensaje claro cuando la columna image_url aún no existe en la BD.
// 42703 = undefined_column (Postgres), PGRST204 = columna ausente del schema cache (PostgREST).
const IMAGE_MIGRATION_HINT = 'Falta la migración de fotos: ejecuta supabase/migrations/2026-07-20_product_images.sql en Supabase'
const isMissingImageColumn = (e) => (e?.code === '42703' || e?.code === 'PGRST204') && /image_url/.test(e?.message || '')
const imageErrMsg = (e) => isMissingImageColumn(e) ? IMAGE_MIGRATION_HINT : e.message
// Se degrada una vez por instancia si la columna no existe; vuelve a true al reciclar la función
let productsHasImageColumn = true

function validateImageUrl(image_url, tenantId) {
  // null = quitar foto; undefined = no tocar
  if (image_url === undefined || image_url === null) return true
  return isAllowedImageUrl(image_url, { supabaseUrl: process.env.SUPABASE_URL, tenantId })
}

async function productsCreate(req, res) {
  const auth = await requireCan(req, res, 'manage_catalog'); if (!auth) return
  const { name, category_id, description, image_url, presentations = [] } = req.body || {}
  if (!name) return res.status(400).json({ error: 'El nombre es requerido' })
  if (!(await tenantOwns('categories', category_id, auth.tenantId))) return res.status(403).json({ error: 'Referencia inválida para esta empresa' })
  if (!validateImageUrl(image_url, auth.tenantId)) return res.status(400).json({ error: 'URL de imagen inválida' })
  const { data: product, error: pe } = await supabaseAdmin.from('products')
    .insert({ tenant_id: auth.tenantId, name, category_id, description, ...(image_url ? { image_url } : {}) }).select().single()
  if (pe) return res.status(500).json({ error: imageErrMsg(pe) })
  if (presentations.length > 0) {
    await supabaseAdmin.from('presentations')
      .insert(presentations.map(p => ({ tenant_id: auth.tenantId, product_id: product.id, label: p.label, price: p.price })))
  }
  const { data: full } = await supabaseAdmin.from('products')
    .select('*, categories(*), presentations(*)').eq('id', product.id).eq('tenant_id', auth.tenantId).single()
  return res.status(201).json(full)
}

async function productsUpdate(req, res, id) {
  const auth = await requireCan(req, res, 'manage_catalog'); if (!auth) return
  const { name, category_id, description, image_url, active, presentations } = req.body || {}
  if (category_id !== undefined && !(await tenantOwns('categories', category_id, auth.tenantId))) return res.status(403).json({ error: 'Referencia inválida para esta empresa' })
  if (!validateImageUrl(image_url, auth.tenantId)) return res.status(400).json({ error: 'URL de imagen inválida' })
  const u = {}
  if (name !== undefined) u.name = name
  if (category_id !== undefined) u.category_id = category_id
  if (description !== undefined) u.description = description
  if (image_url !== undefined) u.image_url = image_url
  if (active !== undefined) u.active = active
  // Si la foto cambia o se quita, borrar el archivo anterior de Storage (best effort)
  let oldImagePath = null
  if (image_url !== undefined) {
    const { data: cur } = await supabaseAdmin.from('products')
      .select('image_url').eq('id', id).eq('tenant_id', auth.tenantId).single()
    if (cur?.image_url && cur.image_url !== image_url) {
      oldImagePath = imagePathFromUrl(cur.image_url, { supabaseUrl: process.env.SUPABASE_URL })
    }
  }
  if (Object.keys(u).length > 0) {
    const { error: ue } = await supabaseAdmin.from('products').update(u).eq('id', id).eq('tenant_id', auth.tenantId)
    if (ue) return res.status(500).json({ error: imageErrMsg(ue) })
  }
  if (oldImagePath) {
    await supabaseAdmin.storage.from(PRODUCT_IMAGES_BUCKET).remove([oldImagePath]).catch(() => {})
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
  const auth = await requireCan(req, res, 'manage_catalog'); if (!auth) return
  await supabaseAdmin.from('products').update({ active: false }).eq('id', id).eq('tenant_id', auth.tenantId)
  return res.status(204).end()
}

/**
 * Borrado masivo de productos del tenant autenticado.
 *
 * Body: { ids?: string[], all?: boolean, hard?: boolean }
 *   - ids  → borra solo esos productos; all: true → todo el catálogo del tenant.
 *   - hard: false (default) → desactiva (active = false), reversible.
 *   - hard: true            → borra las filas y las fotos de Storage.
 *
 * Por qué existe el modo hard: la carga masiva deduplica por nombre sin mirar
 * `active`, así que un producto solo desactivado sigue bloqueando su re-importación.
 * Para "vaciar y volver a cargar el catálogo" hace falta borrarlo de verdad.
 * El histórico de facturas no se ve afectado: invoices.items es JSONB con los
 * nombres y precios ya copiados, no un FK a products.
 */
async function productsBulkDelete(req, res) {
  const auth = await requireCan(req, res, 'manage_catalog'); if (!auth) return
  const { ids, all = false, hard = false } = req.body || {}

  if (!all) {
    if (!Array.isArray(ids) || !ids.length) {
      return res.status(400).json({ error: 'Se requiere un arreglo de ids, o all: true para vaciar el catálogo' })
    }
    if (ids.some(id => typeof id !== 'string' || !id.trim())) {
      return res.status(400).json({ error: 'Ids inválidos' })
    }
    if (ids.length > MAX_BULK_DELETE) {
      return res.status(400).json({ error: `Máximo ${MAX_BULK_DELETE} productos por solicitud` })
    }
  }

  // Toda consulta queda acotada al tenant del token: nunca puede tocar otro.
  const scoped = (q) => (all ? q.eq('tenant_id', auth.tenantId) : q.eq('tenant_id', auth.tenantId).in('id', ids))

  if (!hard) {
    const { data, error } = await scoped(supabaseAdmin.from('products').update({ active: false })).select('id')
    if (error) return res.status(500).json({ error: error.message })
    const count = data?.length || 0
    return res.status(200).json({
      deleted: count, hard: false,
      message: `${count} producto(s) desactivado(s)`,
    })
  }

  // Hard delete: primero leer las fotos para poder limpiarlas de Storage.
  let { data: rows, error: se } = await scoped(supabaseAdmin.from('products').select('id, image_url'))
  if (se && isMissingImageColumn(se)) {
    ;({ data: rows, error: se } = await scoped(supabaseAdmin.from('products').select('id')))
  }
  if (se) return res.status(500).json({ error: se.message })
  if (!rows?.length) return res.status(200).json({ deleted: 0, hard: true, photos_removed: 0, message: 'No había productos para eliminar' })

  // presentations y stock caen por ON DELETE CASCADE
  const { data: del, error: de } = await scoped(supabaseAdmin.from('products').delete()).select('id')
  if (de) return res.status(500).json({ error: de.message })

  // Limpiar fotos huérfanas del bucket (best effort: la fila ya no existe)
  const paths = rows
    .map(r => r.image_url && imagePathFromUrl(r.image_url, { supabaseUrl: process.env.SUPABASE_URL }))
    // Doble candado: solo rutas dentro de la carpeta del propio tenant
    .filter(p => p && p.startsWith(`${auth.tenantId}/`))
  let photosRemoved = 0
  for (let i = 0; i < paths.length; i += 100) {
    const batch = paths.slice(i, i + 100)
    const { error: re } = await supabaseAdmin.storage.from(PRODUCT_IMAGES_BUCKET).remove(batch)
    if (!re) photosRemoved += batch.length
  }

  const count = del?.length || 0
  return res.status(200).json({
    deleted: count, hard: true, photos_removed: photosRemoved,
    message: `${count} producto(s) eliminado(s) definitivamente` +
      (photosRemoved ? `, ${photosRemoved} foto(s) borrada(s)` : ''),
  })
}

// Tope por solicitud para no agotar el tiempo de la función serverless
const MAX_BULK_DELETE = 500

async function productsBulk(req, res) {
  const auth = await requireCan(req, res, 'manage_catalog'); if (!auth) return
  const { products } = req.body || {}
  if (!Array.isArray(products) || !products.length) return res.status(400).json({ error: 'Se requiere un arreglo de productos' })
  for (let i = 0; i < products.length; i++) {
    const p = products[i]
    if (!p.name?.trim()) return res.status(400).json({ error: `Fila ${i + 1}: nombre requerido` })
    if (!Array.isArray(p.presentations) || !p.presentations.length) return res.status(400).json({ error: `"${p.name}": requiere presentaciones` })
    for (const pres of p.presentations) {
      if (!pres.label?.trim() || !pres.price || isNaN(pres.price) || pres.price <= 0) return res.status(400).json({ error: `"${p.name}": presentación inválida` })
    }
    if (!validateImageUrl(p.image_url, auth.tenantId)) return res.status(400).json({ error: `"${p.name}": URL de imagen inválida` })
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
  const results = { created: 0, skipped: 0, photos_added: 0, errors: [] }
  for (const p of products) {
    const cid = p.category?.trim() ? catMap[p.category.trim().toLowerCase()] || null : null
    // Escapar comodines de ILIKE para comparar el nombre literal
    const namePattern = p.name.trim().replace(/([%_\\])/g, '\\$1')
    let { data: ex, error: exErr } = await supabaseAdmin.from('products')
      .select('id, image_url').eq('tenant_id', auth.tenantId).ilike('name', namePattern).limit(1)
    if (exErr && isMissingImageColumn(exErr)) {
      ;({ data: ex, error: exErr } = await supabaseAdmin.from('products')
        .select('id').eq('tenant_id', auth.tenantId).ilike('name', namePattern).limit(1))
    }
    if (exErr) { results.errors.push(`"${p.name}": ${exErr.message}`); continue }
    if (ex?.length) {
      // Duplicado: no se sobreescribe, pero si trae foto y el existente no
      // tiene, se le agrega (permite re-importar el Excel solo para las fotos)
      const existing = ex[0]
      if (p.image_url && 'image_url' in existing && !existing.image_url) {
        const { error: ie } = await supabaseAdmin.from('products')
          .update({ image_url: p.image_url }).eq('id', existing.id).eq('tenant_id', auth.tenantId)
        if (ie) results.errors.push(`"${p.name}" foto: ${imageErrMsg(ie)}`)
        else results.photos_added++
      }
      results.skipped++
      continue
    }
    const { data: np, error: pe } = await supabaseAdmin.from('products')
      .insert({ tenant_id: auth.tenantId, name: p.name.trim(), category_id: cid, description: p.description?.trim() || null, ...(p.image_url ? { image_url: p.image_url } : {}), active: true })
      .select('id').single()
    if (pe) { results.errors.push(`"${p.name}": ${imageErrMsg(pe)}`); continue }
    const { error: pre } = await supabaseAdmin.from('presentations')
      .insert(p.presentations.map(pr => ({ tenant_id: auth.tenantId, product_id: np.id, label: pr.label.trim(), price: Number(pr.price), active: true })))
    if (pre) { results.errors.push(`"${p.name}" pres: ${pre.message}`); continue }
    results.created++
  }
  const message = `${results.created} creado(s), ${results.skipped} omitido(s)` +
    (results.photos_added ? `, ${results.photos_added} foto(s) agregada(s) a productos existentes` : '')
  return res.status(200).json({ message, ...results })
}

// Sube una foto de producto (data URL base64, ya comprimida por el cliente)
// al bucket público product-images bajo la carpeta del tenant.
async function productsUploadImage(req, res) {
  const auth = await requireCan(req, res, 'manage_catalog'); if (!auth) return
  const { data } = req.body || {}
  const parsed = parseImageDataUrl(data)
  if (!parsed) return res.status(400).json({ error: 'Imagen inválida: se espera webp/jpeg/png en base64, máximo 2MB' })
  try {
    await ensureProductImagesBucket(supabaseAdmin)
  } catch (err) {
    return res.status(500).json({ error: `No se pudo preparar el almacenamiento de fotos: ${err.message}` })
  }
  const path = `${auth.tenantId}/${randomUUID()}.${parsed.ext}`
  const { error: upErr } = await supabaseAdmin.storage
    .from(PRODUCT_IMAGES_BUCKET)
    .upload(path, parsed.buffer, { contentType: parsed.mime, cacheControl: '31536000', upsert: false })
  if (upErr) return res.status(500).json({ error: `Error subiendo la imagen: ${upErr.message}` })
  const { data: pub } = supabaseAdmin.storage.from(PRODUCT_IMAGES_BUCKET).getPublicUrl(path)
  return res.status(201).json({ url: pub.publicUrl })
}

// =====================================================
// USUARIOS (tabla sellers)
// =====================================================
const USER_COLS = 'id, name, role, active, created_at, username, pin, password_hash, seller_locations(location_id)'

/** Nunca devolver PIN ni hash al navegador. */
const publicUser = ({ pin, password_hash, ...u }) => ({ ...u, has_pin: !!pin, has_password: !!password_hash })

async function loadPublicUser(tenantId, id) {
  const { data } = await supabaseAdmin.from('sellers').select(USER_COLS).eq('id', id).eq('tenant_id', tenantId).single()
  return data ? publicUser(data) : null
}

/**
 * Columnas de credenciales que aplican al rol final.
 * `currentRole` (rol antes del cambio, solo en edición) permite borrar
 * usuario/hash al degradar admin/owner -> seller/cashier: si no se limpian,
 * una re-promoción posterior restaura en silencio la contraseña anterior.
 */
function credentialColumns(role, patch, currentRole) {
  const c = {}
  if (role === 'admin' || role === 'owner') {
    if (patch.username !== undefined) c.username = normalizeUsername(patch.username)
    if (patch.password) c.password_hash = hashPassword(patch.password)
  } else {
    if (patch.pin !== undefined) c.pin = patch.pin
    if (currentRole !== undefined && currentRole !== role) {
      c.username = null
      c.password_hash = null
    }
  }
  return c
}

const actorOf = (auth) => ({ id: auth.seller.id, role: auth.seller.role, locationIds: auth.scope.locationIds })
const duplicateUsername = (e) => e?.code === '23505'

async function sellersGet(req, res) {
  const auth = await requireCan(req, res, 'manage_staff'); if (!auth) return
  const location_id = scopedLocation(auth, req.query.location_id, res, { allowAll: true })
  if (location_id === undefined) return
  const { data, error } = await supabaseAdmin.from('sellers').select(USER_COLS)
    .eq('tenant_id', auth.tenantId).order('name')
  if (error) return res.status(500).json({ error: error.message })
  const isOwner = auth.seller.role === 'owner'
  const rows = (data || []).filter(u => {
    if (!isOwner && !['seller', 'cashier'].includes(u.role)) return false
    const locs = (u.seller_locations || []).map(sl => sl.location_id)
    if (location_id) return locs.includes(location_id)
    return isOwner || locs.some(l => locationInScope(auth.scope, l))
  })
  return res.status(200).json(rows.map(publicUser))
}

async function sellersCreate(req, res) {
  const auth = await requireCan(req, res, 'manage_staff'); if (!auth) return
  const body = req.body || {}
  if (!String(body.name || '').trim()) return res.status(400).json({ error: 'El nombre es requerido' })
  const verdict = checkUserChange({ actor: actorOf(auth), target: null, patch: body })
  if (!verdict.ok) return res.status(verdict.status).json({ error: verdict.error })
  if (verdict.locationIds.some(l => !locationInScope(auth.scope, l))) {
    return res.status(403).json({ error: 'Referencia inválida para esta empresa' })
  }

  const { data: created, error } = await supabaseAdmin.from('sellers')
    .insert({ tenant_id: auth.tenantId, name: String(body.name).trim(), role: verdict.role, ...credentialColumns(verdict.role, body) })
    .select('id').single()
  if (error) {
    return duplicateUsername(error)
      ? res.status(409).json({ error: 'Ese nombre de usuario ya existe' })
      : res.status(500).json({ error: error.message })
  }
  if (verdict.locationIds.length) {
    const { error: locErr } = await supabaseAdmin.from('seller_locations')
      .insert(verdict.locationIds.map(lid => ({ tenant_id: auth.tenantId, seller_id: created.id, location_id: lid })))
    if (locErr) return res.status(500).json({ error: locErr.message })
  }
  return res.status(201).json(await loadPublicUser(auth.tenantId, created.id))
}

async function updateUser(auth, id, body, res) {
  if (body.active !== undefined && typeof body.active !== 'boolean') {
    return res.status(400).json({ error: 'active debe ser verdadero o falso' })
  }
  const { data: row } = await supabaseAdmin.from('sellers')
    .select('id, role, active, username, pin, password_hash, seller_locations(location_id)')
    .eq('id', id).eq('tenant_id', auth.tenantId).single()
  if (!row) return res.status(404).json({ error: 'Usuario no encontrado' })

  const target = {
    id: row.id, role: row.role, active: row.active, username: row.username,
    hasPassword: !!row.password_hash, hasPin: !!row.pin,
    locationIds: (row.seller_locations || []).map(sl => sl.location_id),
  }
  let activeOwnerCount = 0
  if (row.role === 'owner') {
    const { count } = await supabaseAdmin.from('sellers').select('id', { count: 'exact', head: true })
      .eq('tenant_id', auth.tenantId).eq('role', 'owner').eq('active', true)
    activeOwnerCount = count || 0
  }

  const verdict = checkUserChange({ actor: actorOf(auth), target, patch: body, activeOwnerCount })
  if (!verdict.ok) return res.status(verdict.status).json({ error: verdict.error })
  if (verdict.locationIds?.some(l => !locationInScope(auth.scope, l))) {
    return res.status(403).json({ error: 'Referencia inválida para esta empresa' })
  }

  const u = credentialColumns(verdict.role, body, row.role)
  if (body.name !== undefined) {
    if (!String(body.name).trim()) return res.status(400).json({ error: 'El nombre es requerido' })
    u.name = String(body.name).trim()
  }
  if (body.role !== undefined)   u.role = verdict.role
  if (body.active !== undefined) u.active = body.active

  if (Object.keys(u).length) {
    const { error } = await supabaseAdmin.from('sellers').update(u).eq('id', id).eq('tenant_id', auth.tenantId)
    if (error) {
      return duplicateUsername(error)
        ? res.status(409).json({ error: 'Ese nombre de usuario ya existe' })
        : res.status(500).json({ error: error.message })
    }
  }
  if (verdict.locationIds) {
    const { error: delErr } = await supabaseAdmin.from('seller_locations')
      .delete().eq('seller_id', id).eq('tenant_id', auth.tenantId)
    if (delErr) return res.status(500).json({ error: delErr.message })
    if (verdict.locationIds.length) {
      const { error: insErr } = await supabaseAdmin.from('seller_locations')
        .insert(verdict.locationIds.map(lid => ({ tenant_id: auth.tenantId, seller_id: id, location_id: lid })))
      if (insErr) return res.status(500).json({ error: insErr.message })
    }
  }
  return res.status(200).json(await loadPublicUser(auth.tenantId, id))
}

async function sellersUpdate(req, res, id) {
  const auth = await requireCan(req, res, 'manage_staff'); if (!auth) return
  return updateUser(auth, id, req.body || {}, res)
}

// Desactivar pasa por las mismas reglas que editar (último owner, uno mismo, alcance)
async function sellersDelete(req, res, id) {
  const auth = await requireCan(req, res, 'manage_staff'); if (!auth) return
  return updateUser(auth, id, { active: false }, res)
}

// =====================================================
// REGISTERS
// =====================================================
async function registersGet(req, res) {
  const auth = await requireAuth(req, res); if (!auth) return
  const location_id = scopedLocation(auth, req.query.location_id, res, { allowAll: true })
  if (location_id === undefined) return
  let q = supabaseAdmin.from('registers')
    .select('id, name, location_id, active, created_at')
    .eq('tenant_id', auth.tenantId).eq('active', true).order('name')
  q = location_id ? q.eq('location_id', location_id) : q.in('location_id', auth.scope.locationIds)
  const { data, error } = await q
  if (error) return res.status(500).json({ error: error.message })
  return res.status(200).json(data || [])
}

async function registersCreate(req, res) {
  const auth = await requireCan(req, res, 'manage_registers'); if (!auth) return
  const { name, location_id } = req.body || {}
  if (!name?.trim() || !location_id) return res.status(400).json({ error: 'name y location_id requeridos' })
  if (denyOutOfScope(auth, location_id, res)) return
  const { data, error } = await supabaseAdmin.from('registers')
    .insert({ tenant_id: auth.tenantId, name: name.trim(), location_id, active: true }).select().single()
  if (error) return res.status(500).json({ error: error.message })
  return res.status(201).json(data)
}

async function registersUpdate(req, res, id) {
  const auth = await requireCan(req, res, 'manage_registers'); if (!auth) return
  if (!(await loadScopedRegister(auth, id, res))) return
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
  const auth = await requireCan(req, res, 'manage_registers'); if (!auth) return
  if (!(await loadScopedRegister(auth, id, res))) return
  await supabaseAdmin.from('registers').update({ active: false }).eq('id', id).eq('tenant_id', auth.tenantId)
  return res.status(200).json({ ok: true })
}

// =====================================================
// CIERRES DE CAJA (arqueo)
// =====================================================
const CLOSURES_MIGRATION_HINT = 'Falta la migración: ejecuta supabase/migrations/2026-07-21_caja_v2.sql en Supabase'
const closuresErrMsg = (e) => /register_closures/.test(e?.message || '') ? CLOSURES_MIGRATION_HINT : e.message

// Totales esperados del día (hora Bogotá) según facturas pagadas
async function closureExpected(auth, { register_id, location_id }) {
  const hoy = bogotaDate()
  const { data, error } = await supabaseAdmin.rpc('report_range_summary', {
    p_tenant_id: auth.tenantId, p_from: hoy, p_to: hoy,
    p_location_id: location_id || null,
    p_register_id: register_id || null,
  })
  if (error) throw new Error(error.message)
  const s = data?.[0] || {}
  return {
    date: hoy,
    invoice_count:     Number(s.invoice_count || 0),
    expected_cash:     Number(s.cash || 0),
    expected_transfer: Number(s.transfer || 0),
    expected_card:     Number(s.card || 0),
  }
}

async function closuresSummary(req, res) {
  const auth = await requireCan(req, res, 'cash_session'); if (!auth) return
  const location_id = scopedLocation(auth, req.query.location_id, res)
  if (location_id === undefined) return
  const { register_id } = req.query
  if (register_id) {
    const reg = await loadScopedRegister(auth, register_id, res); if (!reg) return
    if (reg.location_id !== location_id) return res.status(403).json({ error: 'La caja no pertenece a este punto de venta' })
  }
  let expected
  try { expected = await closureExpected(auth, { register_id, location_id }) }
  catch (e) { return res.status(500).json({ error: e.message }) }
  let existing = null
  if (register_id) {
    const { data } = await supabaseAdmin.from('register_closures')
      .select('*').eq('tenant_id', auth.tenantId)
      .eq('register_id', register_id).eq('business_date', expected.date).limit(1)
    existing = data?.[0] || null
  }
  return res.status(200).json({ ...expected, existing })
}

async function closuresCreate(req, res) {
  const auth = await requireCan(req, res, 'cash_session'); if (!auth) return
  const { register_id, register_name, declared_cash, notes } = req.body || {}
  const location_id = scopedLocation(auth, req.body?.location_id, res)
  if (location_id === undefined) return
  const declared = Number(declared_cash)
  if (isNaN(declared) || declared < 0) return res.status(400).json({ error: 'El efectivo contado debe ser un número válido' })
  if (register_id) {
    const reg = await loadScopedRegister(auth, register_id, res); if (!reg) return
    if (reg.location_id !== location_id) return res.status(403).json({ error: 'La caja no pertenece a este punto de venta' })
  }

  let expected
  try { expected = await closureExpected(auth, { register_id, location_id }) }
  catch (e) { return res.status(500).json({ error: e.message }) }

  const { data, error } = await supabaseAdmin.from('register_closures').insert({
    tenant_id:         auth.tenantId,
    location_id,
    register_id:       register_id || null,
    register_name:     register_name || null,
    cashier_id:        auth.seller.id,
    cashier_name:      auth.seller.name,
    business_date:     expected.date,
    expected_cash:     expected.expected_cash,
    expected_transfer: expected.expected_transfer,
    expected_card:     expected.expected_card,
    declared_cash:     declared,
    difference:        declared - expected.expected_cash,
    invoice_count:     expected.invoice_count,
    notes:             notes?.trim() || null,
  }).select().single()
  if (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'Esta caja ya fue cerrada hoy' })
    return res.status(500).json({ error: closuresErrMsg(error) })
  }
  return res.status(201).json(data)
}

async function closuresList(req, res) {
  const auth = await requireCan(req, res, 'cash_session'); if (!auth) return
  let range
  try { range = parseRange(req.query) } catch (e) { return res.status(e.status || 400).json({ error: e.message }) }
  const location_id = scopedLocation(auth, req.query.location_id, res, { allowAll: true })
  if (location_id === undefined) return
  let q = supabaseAdmin.from('register_closures').select('*')
    .eq('tenant_id', auth.tenantId)
    .gte('business_date', range.from).lte('business_date', range.to)
    .order('closed_at', { ascending: false }).limit(100)
  q = location_id ? q.eq('location_id', location_id) : q.in('location_id', auth.scope.locationIds)
  const { data, error } = await q
  if (error) return res.status(500).json({ error: closuresErrMsg(error) })
  return res.status(200).json(data || [])
}

// =====================================================
// INVOICES
// =====================================================
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const UNIQUE_VIOLATION = '23505'

// Idempotencia: se degrada una vez por instancia si falta la migración
let invoicesHaveClientOpId = true
const isMissingClientOpIdColumn = (e) =>
  (e?.code === '42703' || e?.code === 'PGRST204') && /client_op_id/.test(e?.message || '')

/**
 * Catálogo autoritativo para cotizar: precio, etiqueta y nombre salen de la BD,
 * nunca del body. Solo presentaciones activas del propio tenant.
 */
async function fetchPresentationCatalog(tenantId, clientItems) {
  const ids = [...new Set(
    (clientItems || []).map(i => i?.presentationId).filter(id => typeof id === 'string' && UUID_RE.test(id))
  )]
  if (!ids.length) return { status: 400, error: 'Item inválido: falta la presentación' }
  const { data, error } = await supabaseAdmin.from('presentations')
    .select('id, label, price, product_id, products(name)')
    .eq('tenant_id', tenantId).eq('active', true).in('id', ids)
  if (error) return { status: 500, error: error.message }
  const map = new Map()
  for (const r of data || []) {
    map.set(r.id, { label: r.label, price: r.price, product_id: r.product_id, product_name: r.products?.name || null })
  }
  return { map }
}

const findByClientOpId = async (tenantId, clientOpId) => {
  const { data, error } = await supabaseAdmin.from('invoices')
    .select('*').eq('tenant_id', tenantId).eq('client_op_id', clientOpId).limit(1).maybeSingle()
  // Falta la migración: apagar la búsqueda aquí evita repetir esta consulta
  // fallida en cada venta hasta que el INSERT descubra lo mismo.
  if (error && isMissingClientOpIdColumn(error)) invoicesHaveClientOpId = false
  return data || null
}

async function invoicesCreate(req, res) {
  const auth = await requireCan(req, res, 'sell'); if (!auth) return
  const { seller_id, seller_name, location_name, items, client_op_id } = req.body || {}
  if (!seller_id || !Array.isArray(items) || !items.length) return res.status(400).json({ error: 'location_id, seller_id e items requeridos' })
  if (client_op_id != null && !UUID_RE.test(String(client_op_id))) {
    return res.status(400).json({ error: 'client_op_id inválido' })
  }
  const location_id = scopedLocation(auth, req.body?.location_id, res)
  if (location_id === undefined) return
  if (!(await tenantOwns('sellers', seller_id, auth.tenantId))) return res.status(403).json({ error: 'Referencia inválida para esta empresa' })

  // Reintento de una petición cuya respuesta se perdió: devolver la factura
  // que ya se creó en vez de duplicar la venta.
  if (client_op_id && invoicesHaveClientOpId) {
    const previo = await findByClientOpId(auth.tenantId, client_op_id)
    if (previo) return res.status(200).json(previo)
  }

  // Precio, nombre y etiqueta salen de la BD; del body solo qué y cuánto.
  const catalog = await fetchPresentationCatalog(auth.tenantId, items)
  if (catalog.error) return res.status(catalog.status).json({ error: catalog.error })
  const built = buildInvoiceItems(items, catalog.map)
  if (built.error) return res.status(400).json({ error: built.error })

  // get_next_invoice_code busca un código libre, pero el INSERT ocurre después:
  // dos cobros simultáneos en el mismo punto pueden pedir el mismo. El índice
  // único protege los datos; este bucle evita que el vendedor vea un 500.
  for (let intento = 0; intento < 5; intento++) {
    const { data: code, error: ce } = await supabaseAdmin.rpc('get_next_invoice_code', { p_location_id: location_id })
    if (ce || !code) return res.status(500).json({ error: 'No se pudo generar código' })

    const { data: invoice, error: ie } = await supabaseAdmin.from('invoices').insert({
      tenant_id: auth.tenantId, code, location_id, location_name, seller_id, seller_name,
      total: built.total, status: 'pending', items: built.items,
      ...(client_op_id && invoicesHaveClientOpId ? { client_op_id } : {}),
    }).select().single()

    if (!ie) return res.status(201).json(invoice)

    // Falta la migración de idempotencia: seguir sin ella antes que no facturar
    if (invoicesHaveClientOpId && isMissingClientOpIdColumn(ie)) {
      invoicesHaveClientOpId = false
      continue
    }
    if (ie.code === UNIQUE_VIOLATION) {
      // Carrera entre dos reintentos del mismo cobro: ganó el otro, devolver el suyo
      if (client_op_id && /client_op_id/.test(ie.message || '')) {
        const previo = await findByClientOpId(auth.tenantId, client_op_id)
        if (previo) return res.status(200).json(previo)
      }
      continue // colisión de código: pedir otro
    }
    return res.status(500).json({ error: ie.message })
  }
  return res.status(503).json({ error: 'El punto de venta está saturado, intenta de nuevo' })
}

async function invoicesPending(req, res) {
  const auth = await requireAuth(req, res); if (!auth) return
  const location_id = scopedLocation(auth, req.query.location_id, res)
  if (location_id === undefined) return
  const { data, error } = await supabaseAdmin.from('invoices')
    .select('id, code, total, items, seller_id, seller_name, location_name, created_at, status, observations, edited_at')
    .eq('tenant_id', auth.tenantId).eq('location_id', location_id).eq('status', 'pending')
    .order('created_at', { ascending: false })
  if (error) return res.status(500).json({ error: error.message })
  return res.status(200).json(data || [])
}

async function invoicesGetByCode(req, res, code) {
  const auth = await requireAuth(req, res); if (!auth) return
  const location_id = scopedLocation(auth, req.query.location_id, res)
  if (location_id === undefined) return
  const { data, error } = await supabaseAdmin.from('invoices')
    .select('*').eq('tenant_id', auth.tenantId).eq('code', code).eq('location_id', location_id).eq('status', 'pending')
    .order('created_at', { ascending: false }).limit(1).single()
  if (error && error.code !== 'PGRST116') return res.status(500).json({ error: error.message })
  if (!data) return res.status(404).json({ error: `No hay factura pendiente con código ${code}` })
  return res.status(200).json(data)
}

async function invoicesPay(req, res, code) {
  const auth = await requireCan(req, res, 'charge'); if (!auth) return
  const { pay_method, observations, register_id, register_name, discount, transfer_provider } = req.body || {}
  const location_id = scopedLocation(auth, req.body?.location_id, res)
  if (location_id === undefined) return
  if (!pay_method) return res.status(400).json({ error: 'location_id y pay_method requeridos' })
  if (!['cash', 'transfer', 'card'].includes(pay_method)) return res.status(400).json({ error: 'pay_method inválido' })
  if (register_id) {
    const reg = await loadScopedRegister(auth, register_id, res); if (!reg) return
    if (reg.location_id !== location_id) return res.status(403).json({ error: 'La caja no pertenece a este punto de venta' })
  }

  // Detalle de la transferencia. Quien lo exige es la UI, no la API: un equipo
  // que todavía corra el bundle anterior no manda el campo, y dejarlo sin cobrar
  // sería peor que perder el detalle. Lo que sí se rechaza es un valor inválido
  // o un proveedor en un método que no es transferencia (el CHECK de la BD
  // rechazaría el insert y tumbaría el cobro con un error opaco).
  if (transfer_provider !== undefined && transfer_provider !== null) {
    if (!TRANSFER_PROVIDERS.includes(transfer_provider)) {
      return res.status(400).json({ error: 'Transferencia inválida: usa Nequi, Daviplata o Bancolombia' })
    }
    if (pay_method !== 'transfer') {
      return res.status(400).json({ error: 'El detalle de transferencia solo aplica a pagos por transferencia' })
    }
  }

  // Descuento opcional al cobrar (monto en pesos sobre el total)
  const d = Number(discount || 0)
  if (isNaN(d) || d < 0) return res.status(400).json({ error: 'Descuento inválido' })
  const discountUpdate = {}
  if (d > 0) {
    const { data: cur } = await supabaseAdmin.from('invoices')
      .select('total').eq('tenant_id', auth.tenantId).eq('code', code)
      .eq('location_id', location_id).eq('status', 'pending').single()
    if (!cur) return res.status(409).json({ error: 'Factura no existe, ya cobrada o cancelada' })
    if (d > Number(cur.total)) return res.status(400).json({ error: 'El descuento no puede superar el total' })
    discountUpdate.discount = d
    discountUpdate.total = Number(cur.total) - d
  }

  const payInvoice = (withProvider) => supabaseAdmin.from('invoices').update({
    status: 'paid', pay_method, paid_at: new Date().toISOString(),
    cashier_id: auth.seller.id, cashier_name: auth.seller.name,
    ...(register_id ? { register_id } : {}), ...(register_name ? { register_name } : {}),
    ...(observations ? { observations } : {}),
    ...(withProvider && transfer_provider ? { transfer_provider } : {}),
    ...discountUpdate,
  }).eq('tenant_id', auth.tenantId).eq('code', code).eq('location_id', location_id).eq('status', 'pending').select().single()

  let { data, error } = await payInvoice(invoicesHaveTransferProvider)
  // Fallback pre-migración: cobrar nunca puede fallar por una columna que
  // todavía no existe. Se pierde el detalle, no la venta.
  if (error && invoicesHaveTransferProvider && isMissingTransferProviderColumn(error)) {
    invoicesHaveTransferProvider = false
    ;({ data, error } = await payInvoice(false))
  }
  if (error) return res.status(500).json({ error: /discount/.test(error.message) ? CLOSURES_MIGRATION_HINT : error.message })
  if (!data) return res.status(409).json({ error: 'Factura no existe, ya cobrada o cancelada' })
  return res.status(200).json(data)
}

const TRANSFER_PROVIDERS = ['nequi', 'daviplata', 'bancolombia']

// Se degrada una vez por instancia si falta la migración; vuelve a true al reciclar
let invoicesHaveTransferProvider = true
const isMissingTransferProviderColumn = (e) =>
  (e?.code === '42703' || e?.code === 'PGRST204') && /transfer_provider/.test(e?.message || '')

// Devolución de una factura pagada (anulación total con motivo).
// Por id: el código de 4 dígitos se recicla entre facturas ya pagadas.
async function invoicesRefund(req, res, id) {
  const auth = await requireCan(req, res, 'refund'); if (!auth) return
  const { data: inv } = await supabaseAdmin.from('invoices')
    .select('id, location_id').eq('id', id).eq('tenant_id', auth.tenantId).single()
  if (!inv) return res.status(404).json({ error: 'Factura no encontrada' })
  if (denyOutOfScope(auth, inv.location_id, res)) return
  const { reason } = req.body || {}
  if (!reason?.trim()) return res.status(400).json({ error: 'El motivo de la devolución es requerido' })
  const { data, error } = await supabaseAdmin.from('invoices').update({
    status: 'refunded',
    refunded_at: new Date().toISOString(),
    refund_reason: reason.trim(),
    refunded_by: auth.seller.id,
  }).eq('id', id).eq('tenant_id', auth.tenantId).eq('status', 'paid').select().single()
  if (error) return res.status(500).json({ error: /refund|invoices_status_check/.test(error.message) ? CLOSURES_MIGRATION_HINT : error.message })
  if (!data) return res.status(409).json({ error: 'Solo las facturas pagadas pueden devolverse' })
  return res.status(200).json(data)
}

async function invoicesCancel(req, res, code) {
  const auth = await requireCan(req, res, 'charge'); if (!auth) return
  const location_id = scopedLocation(auth, req.body?.location_id, res)
  if (location_id === undefined) return
  const { data, error } = await supabaseAdmin.from('invoices')
    .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
    .eq('tenant_id', auth.tenantId).eq('code', code).eq('location_id', location_id).eq('status', 'pending').select().single()
  if (error) return res.status(500).json({ error: error.message })
  if (!data) return res.status(409).json({ error: 'Factura no existe, ya cobrada o cancelada' })
  return res.status(200).json(data)
}

async function invoicesEdit(req, res, code) {
  const auth = await requireCan(req, res, 'charge'); if (!auth) return
  const { items, observations } = req.body || {}
  const location_id = scopedLocation(auth, req.body?.location_id, res)
  if (location_id === undefined) return
  const { data: existing } = await supabaseAdmin.from('invoices')
    .select('id').eq('tenant_id', auth.tenantId).eq('code', code).eq('location_id', location_id).eq('status', 'pending').single()
  if (!existing) return res.status(404).json({ error: 'Factura pendiente no encontrada' })
  const u = { edited_by: auth.seller.id, edited_at: new Date().toISOString() }
  if (items !== undefined) {
    if (!Array.isArray(items) || !items.length) return res.status(400).json({ error: 'items vacío' })
    // Igual que al crear: recotizar contra la BD. Si no, editar una factura
    // sería la puerta de atrás para el precio que quisiera el cliente.
    const catalog = await fetchPresentationCatalog(auth.tenantId, items)
    if (catalog.error) return res.status(catalog.status).json({ error: catalog.error })
    const built = buildInvoiceItems(items, catalog.map)
    if (built.error) return res.status(400).json({ error: built.error })
    u.items = built.items; u.total = built.total
  }
  if (observations !== undefined) u.observations = observations || null
  const { data, error } = await supabaseAdmin.from('invoices')
    .update(u).eq('id', existing.id).eq('status', 'pending').select().single()
  if (error) return res.status(500).json({ error: error.message })
  return res.status(200).json(data)
}

async function invoicesHistory(req, res) {
  const auth = await requireCan(req, res, 'charge'); if (!auth) return
  const { status, seller_id, limit = '50', offset = '0' } = req.query
  let range
  try { range = parseRange(req.query) } catch (e) { return res.status(e.status || 400).json({ error: e.message }) }
  const location_id = scopedLocation(auth, req.query.location_id, res, { allowAll: true })
  if (location_id === undefined) return
  const bounds = bogotaDayBounds(range.from, range.to)
  let q = supabaseAdmin.from('invoices')
    .select('*', { count: 'exact' })
    .eq('tenant_id', auth.tenantId)
    .gte('created_at', bounds.start).lt('created_at', bounds.end).order('created_at', { ascending: false })
    .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1)
  q = location_id ? q.eq('location_id', location_id) : q.in('location_id', auth.scope.locationIds)
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
  const auth = await requireCan(req, res, 'view_reports'); if (!auth) return
  let range
  try { range = parseRange(req.query) } catch (e) { return res.status(e.status || 400).json({ error: e.message }) }
  const { from, to } = range
  const location_id = scopedLocation(auth, req.query.location_id, res, { allowAll: true })
  if (location_id === undefined) return

  const [{ data: summaryRows, error }, providers] = await Promise.all([
    supabaseAdmin.rpc('report_range_summary', {
      p_tenant_id: auth.tenantId, p_from: from, p_to: to,
      p_location_id: location_id || null,
    }),
    transferBreakdown(auth.tenantId, { from, to, location_id }),
  ])
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
    by_transfer_provider: providers, // null si falta la migración
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
  const auth = await requireCan(req, res, 'view_reports'); if (!auth) return
  let range
  try { range = parseRange(req.query) } catch (e) { return res.status(e.status || 400).json({ error: e.message }) }
  const location_id = scopedLocation(auth, req.query.location_id, res, { allowAll: true })
  if (location_id === undefined) return
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
  const auth = await requireCan(req, res, 'view_reports'); if (!auth) return
  let range
  try { range = parseRange(req.query) } catch (e) { return res.status(e.status || 400).json({ error: e.message }) }
  const location_id = scopedLocation(auth, req.query.location_id, res, { allowAll: true })
  if (location_id === undefined) return
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
  const auth = await requireCan(req, res, 'view_consolidated'); if (!auth) return
  let range
  try { range = parseRange(req.query) } catch (e) { return res.status(e.status || 400).json({ error: e.message }) }
  const [{ data, error }, { data: locRows, error: locErr }] = await Promise.all([
    supabaseAdmin.rpc('report_range_by_location', {
      p_tenant_id: auth.tenantId, p_from: range.from, p_to: range.to,
    }),
    supabaseAdmin.from('locations').select('id, name, address').eq('tenant_id', auth.tenantId).eq('active', true),
  ])
  if (error) return res.status(500).json({ error: error.message })
  if (locErr) return res.status(500).json({ error: locErr.message })

  // Sembrar con TODAS las locations activas en ceros para que un punto sin
  // ventas en el rango no desaparezca del reporte; luego superponer las
  // filas del RPC (una location inactiva con ventas históricas también entra).
  const map = {}
  ;(locRows || []).forEach(l => {
    map[l.id] = {
      location_id: l.id, location_name: l.name, address: l.address || null,
      total_revenue: 0, invoice_count: 0, pending_count: 0, cancelled_count: 0, avg_ticket: 0,
      by_pay_method: { cash: 0, transfer: 0, card: 0 },
    }
  })
  ;(data || []).forEach(l => {
    const tr = Number(l.total_revenue || 0), ic = Number(l.invoice_count || 0)
    const prev = map[l.location_id]
    map[l.location_id] = {
      location_id: l.location_id, location_name: l.location_name, address: prev ? prev.address : null,
      total_revenue: tr, invoice_count: ic,
      pending_count: Number(l.pending_count || 0), cancelled_count: Number(l.cancelled_count || 0),
      avg_ticket: ic > 0 ? tr / ic : 0,
      by_pay_method: { cash: Number(l.cash || 0), transfer: Number(l.transfer || 0), card: Number(l.card || 0) },
    }
  })
  return res.status(200).json(Object.values(map).sort((a, b) => b.total_revenue - a.total_revenue))
}

async function reportTopProducts(req, res) {
  const auth = await requireCan(req, res, 'view_reports'); if (!auth) return
  let range
  try { range = parseRange(req.query) } catch (e) { return res.status(e.status || 400).json({ error: e.message }) }
  const { seller_id, register_id, limit = '10' } = req.query
  const location_id = scopedLocation(auth, req.query.location_id, res, { allowAll: true })
  if (location_id === undefined) return
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

/**
 * Desglose de las transferencias por billetera/banco dentro de un rango.
 * Devuelve pesos por proveedor, más `sin_detalle` para las que se cobraron
 * antes de que existiera el campo. La suma cuadra con by_pay_method.transfer
 * porque replica los mismos filtros del RPC (pagadas, por created_at Bogotá).
 *
 * Devuelve null si falta la migración: la UI simplemente omite el desglose.
 */
async function transferBreakdown(tenantId, { from, to, location_id, seller_id, register_id }) {
  if (!invoicesHaveTransferProvider) return null
  const bounds = bogotaDayBounds(from, to)
  let q = supabaseAdmin.from('invoices')
    .select('transfer_provider, total')
    .eq('tenant_id', tenantId).eq('status', 'paid').eq('pay_method', 'transfer')
    .gte('created_at', bounds.start).lt('created_at', bounds.end)
  if (location_id) q = q.eq('location_id', location_id)
  if (seller_id)   q = q.eq('seller_id', seller_id)
  if (register_id) q = q.eq('register_id', register_id)

  const { data, error } = await q
  if (error) {
    if (isMissingTransferProviderColumn(error)) invoicesHaveTransferProvider = false
    return null
  }
  const out = { nequi: 0, daviplata: 0, bancolombia: 0, sin_detalle: 0 }
  for (const row of data || []) {
    const key = TRANSFER_PROVIDERS.includes(row.transfer_provider) ? row.transfer_provider : 'sin_detalle'
    out[key] += Number(row.total || 0)
  }
  return out
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
  const invoicesQuery = (withProvider) => {
    let q = supabaseAdmin.from('invoices')
      .select(`id, code, location_id, location_name, seller_name, cashier_name, register_name, total, status, pay_method,${withProvider ? ' transfer_provider,' : ''} items, created_at, paid_at`)
      .eq('tenant_id', auth.tenantId)
      .gte('created_at', bounds.start).lt('created_at', bounds.end)
      .order('created_at', { ascending: false }).limit(100)
    if (location_id) q = q.eq('location_id', location_id)
    if (seller_id)   q = q.eq('seller_id', seller_id)
    if (register_id) q = q.eq('register_id', register_id)
    return q
  }

  let [sum, hours, prods, invs, providers] = await Promise.all([
    supabaseAdmin.rpc('report_range_summary', rpcParams),
    supabaseAdmin.rpc('report_range_by_hour', rpcParams),
    supabaseAdmin.rpc('report_range_products', rpcParams),
    invoicesQuery(invoicesHaveTransferProvider),
    transferBreakdown(auth.tenantId, { from, to, location_id, seller_id, register_id }),
  ])
  // Fallback pre-migración: pedir la columna la tumba, reintentar sin ella
  if (invs.error && isMissingTransferProviderColumn(invs.error)) {
    invoicesHaveTransferProvider = false
    invs = await invoicesQuery(false)
  }
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
      by_transfer_provider: providers,
    },
    by_hour: (hours.data || []).map(h => ({ hour: h.hour, count: Number(h.invoice_count || 0), revenue: Number(h.total_revenue || 0) })),
    top_products: (prods.data || []).slice(0, 10).map(p => ({ name: `${p.product_name}${p.label && p.label !== 'Unidad' ? ` (${p.label})` : ''}`, qty: Number(p.total_qty || 0), revenue: Number(p.total_revenue || 0) })),
    invoices: invs.data || [],
  }
}

async function reportSellerDetail(req, res) {
  const auth = await requireCan(req, res, 'view_reports'); if (!auth) return
  const { seller_id } = req.query
  if (!seller_id) return res.status(400).json({ error: 'seller_id requerido' })
  let range
  try { range = parseRange(req.query) } catch (e) { return res.status(e.status || 400).json({ error: e.message }) }
  const location_id = scopedLocation(auth, req.query.location_id, res, { allowAll: true })
  if (location_id === undefined) return
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
  const auth = await requireCan(req, res, 'view_reports'); if (!auth) return
  const { register_id } = req.query
  if (!register_id) return res.status(400).json({ error: 'register_id requerido' })
  let range
  try { range = parseRange(req.query) } catch (e) { return res.status(e.status || 400).json({ error: e.message }) }
  const register = await loadScopedRegister(auth, register_id, res); if (!register) return
  const location_id = register.location_id
  let detail
  try { detail = await rangeDetail(auth, { from: range.from, to: range.to, location_id, register_id }) }
  catch (e) { return res.status(e.status || 500).json({ error: e.message }) }
  return res.status(200).json({
    register, from: range.from, to: range.to,
    ...detail,
  })
}
