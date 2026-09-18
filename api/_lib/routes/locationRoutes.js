import { randomUUID } from 'node:crypto'
import { supabaseAdmin } from '../supabaseAdmin.js'
import { requireAuth, requireCan } from '../auth.js'
import { can } from '../roles.js'
import { defaultPrinterConfig } from '../printerConfig.js'
import { denyOutOfScope } from '../scopedLocation.js'
import { parseImageDataUrl, ensureProductImagesBucket, PRODUCT_IMAGES_BUCKET } from '../productImages.js'

export async function locationsGet(req, res) {
  const auth = await requireAuth(req, res); if (!auth) return
  const { data, error } = await supabaseAdmin.from('locations')
    .select('id, name, address, printer_config, active')
    .eq('tenant_id', auth.tenantId).in('id', auth.scope.locationIds).order('name')
  if (error) return res.status(500).json({ error: error.message })
  return res.status(200).json(data)
}

export async function locationsCreate(req, res) {
  const auth = await requireCan(req, res, 'manage_locations'); if (!auth) return
  const { name, address, printer_config } = req.body || {}
  if (!name) return res.status(400).json({ error: 'El nombre es requerido' })
  const { data, error } = await supabaseAdmin.from('locations')
    .insert({ tenant_id: auth.tenantId, name, address, printer_config: printer_config || defaultPrinterConfig(auth.tenant.name, address) })
    .select().single()
  if (error) return res.status(500).json({ error: error.message })
  return res.status(201).json(data)
}

export async function locationsUpdate(req, res, id) {
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

export async function locationsDelete(req, res, id) {
  const auth = await requireCan(req, res, 'manage_locations'); if (!auth) return
  if (denyOutOfScope(auth, id, res)) return
  await supabaseAdmin.from('locations').update({ active: false }).eq('id', id).eq('tenant_id', auth.tenantId)
  return res.status(204).end()
}

export async function locationCatalogConfigGet(req, res, locationId) {
  const auth = await requireAuth(req, res); if (!auth) return
  if (denyOutOfScope(auth, locationId, res)) return

  const [pricesRes, prodsRes] = await Promise.all([
    supabaseAdmin.from('location_prices')
      .select('presentation_id, price')
      .eq('tenant_id', auth.tenantId).eq('location_id', locationId),
    supabaseAdmin.from('location_products')
      .select('product_id, active')
      .eq('tenant_id', auth.tenantId).eq('location_id', locationId),
  ])

  return res.status(200).json({
    prices: pricesRes.data || [],
    products: prodsRes.data || [],
  })
}

export async function locationCatalogConfigPut(req, res, locationId) {
  const auth = await requireAuth(req, res); if (!auth) return
  if (auth.seller.role !== 'owner') {
    return res.status(403).json({ error: 'Solo el superadministrador puede editar precios y catálogo por punto' })
  }
  if (denyOutOfScope(auth, locationId, res)) return
  const { prices, products } = req.body || {}

  // Actualizar precios diferenciales
  if (Array.isArray(prices)) {
    await supabaseAdmin.from('location_prices')
      .delete().eq('tenant_id', auth.tenantId).eq('location_id', locationId)

    const validPrices = prices.filter(p => p.presentation_id && Number.isFinite(Number(p.price)) && Number(p.price) >= 0)
    if (validPrices.length > 0) {
      await supabaseAdmin.from('location_prices').insert(
        validPrices.map(p => ({
          tenant_id:       auth.tenantId,
          location_id:     locationId,
          presentation_id: p.presentation_id,
          price:           Math.round(Number(p.price) * 100) / 100,
        }))
      )
    }
  }

  // Actualizar productos habilitados/deshabilitados
  if (Array.isArray(products)) {
    await supabaseAdmin.from('location_products')
      .delete().eq('tenant_id', auth.tenantId).eq('location_id', locationId)

    const validProds = products.filter(p => p.product_id)
    if (validProds.length > 0) {
      await supabaseAdmin.from('location_products').insert(
        validProds.map(p => ({
          tenant_id:   auth.tenantId,
          location_id: locationId,
          product_id:  p.product_id,
          active:      p.active !== false,
        }))
      )
    }
  }

  return res.status(200).json({ ok: true, message: 'Catálogo de punto de venta actualizado' })
}

// Subir logo para recibo térmico (guarda en bucket público y retorna URL)
export async function printerUploadLogo(req, res) {
  const auth = await requireCan(req, res, 'configure_printer'); if (!auth) return
  const { data } = req.body || {}
  const parsed = parseImageDataUrl(data)
  if (!parsed) return res.status(400).json({ error: 'Imagen inválida: se espera png/jpeg/webp en base64, máximo 2MB' })
  try {
    await ensureProductImagesBucket(supabaseAdmin)
  } catch (err) {
    return res.status(500).json({ error: `No se pudo preparar el almacenamiento: ${err.message}` })
  }
  const path = `${auth.tenantId}/printer_logo_${randomUUID()}.${parsed.ext}`
  const { error: upErr } = await supabaseAdmin.storage
    .from(PRODUCT_IMAGES_BUCKET)
    .upload(path, parsed.buffer, { contentType: parsed.mime, cacheControl: '31536000', upsert: false })
  if (upErr) return res.status(500).json({ error: `Error subiendo el logo: ${upErr.message}` })
  const { data: pub } = supabaseAdmin.storage.from(PRODUCT_IMAGES_BUCKET).getPublicUrl(path)
  return res.status(201).json({ url: pub.publicUrl })
}

// Guardar configuración de impresora / logo para un punto o todos los puntos
export async function printerConfigBatchPut(req, res) {
  const auth = await requireCan(req, res, 'configure_printer'); if (!auth) return
  const { location_id, all_locations, printer_config } = req.body || {}
  if (!printer_config || typeof printer_config !== 'object') {
    return res.status(400).json({ error: 'printer_config requerido' })
  }

  if (all_locations) {
    if (auth.seller.role !== 'owner') {
      return res.status(403).json({ error: 'Solo el superadministrador puede aplicar configuración a todos los puntos' })
    }
    const { error } = await supabaseAdmin.from('locations')
      .update({ printer_config }).eq('tenant_id', auth.tenantId)
  if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ message: 'Configuración aplicada a todos los puntos de venta' })
  }

  if (!location_id) return res.status(400).json({ error: 'location_id o all_locations requerido' })
  if (denyOutOfScope(auth, location_id, res)) return

  const { error } = await supabaseAdmin.from('locations')
    .update({ printer_config }).eq('id', location_id).eq('tenant_id', auth.tenantId)
  if (error) return res.status(500).json({ error: error.message })
  return res.status(200).json({ message: 'Configuración de impresora actualizada' })
}
