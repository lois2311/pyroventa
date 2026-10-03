import { randomUUID } from 'node:crypto'
import { supabaseAdmin } from '../supabaseAdmin.js'
import { requireAuth, requireCan } from '../auth.js'
import { can } from '../roles.js'
import { denyOutOfScope } from '../scopedLocation.js'
import { tenantOwns } from '../tenantOwns.js'
import { compareProducts } from '../productSort.js'
import { parseImageDataUrl, isAllowedImageUrl, imagePathFromUrl, ensureProductImagesBucket, PRODUCT_IMAGES_BUCKET } from '../productImages.js'
import { initProductStock, adjustStock, stockFields, loadStockPolicy, fetchProductTracking } from '../services/stockService.js'

// Segmentos de /products/* que son endpoints, no ids de producto
export const PRODUCT_SUBROUTES = ['bulk', 'bulk-delete', 'upload-image']

// Tope por solicitud para no agotar el tiempo de la función serverless
const MAX_BULK_DELETE = 500

// Mensaje claro cuando la columna image_url aún no existe en la BD.
// 42703 = undefined_column (Postgres), PGRST204 = columna ausente del schema cache (PostgREST).
const IMAGE_MIGRATION_HINT = 'Falta la migración de fotos: ejecuta supabase/migrations/2026-07-20_product_images.sql en Supabase'
const isMissingImageColumn = (e) => (e?.code === '42703' || e?.code === 'PGRST204') && /image_url/.test(e?.message || '')
const imageErrMsg = (e) => isMissingImageColumn(e) ? IMAGE_MIGRATION_HINT : e.message
// Se degrada una vez por instancia si la columna no existe; vuelve a true al reciclar la función
let productsHasImageColumn = true

/** track_stock / min_stock tal como se editan en el formulario de producto. */
const trackingMeta = (t) => ({ track_stock: t?.track_stock !== false, min_stock: t?.min_stock ?? null })

/** Campos de seguimiento del body (solo los presentes) o { error }. */
function parseStockSettings({ track_stock, min_stock }) {
  const fields = {}
  if (track_stock !== undefined) fields.track_stock = Boolean(track_stock)
  if (min_stock !== undefined) {
    if (min_stock === null || min_stock === '') fields.min_stock = null
    else {
      const n = Number(min_stock)
      if (!Number.isInteger(n) || n < 0) return { error: 'La alerta de stock bajo debe ser un entero mayor o igual a 0' }
      fields.min_stock = n
    }
  }
  return { fields }
}

function validateImageUrl(image_url, tenantId) {
  // null = quitar foto; undefined = no tocar
  if (image_url === undefined || image_url === null) return true
  return isAllowedImageUrl(image_url, { supabaseUrl: process.env.SUPABASE_URL, tenantId })
}

export async function productsGet(req, res) {
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
    const [{ data: stockRows }, locPricesRes, locProdsRes, policy, tracking] = await Promise.all([
      supabaseAdmin.from('stock')
        .select('product_id, quantity').eq('location_id', location_id).eq('tenant_id', auth.tenantId),
      supabaseAdmin.from('location_prices')
        .select('presentation_id, price').eq('location_id', location_id).eq('tenant_id', auth.tenantId),
      supabaseAdmin.from('location_products')
        .select('product_id, active').eq('location_id', location_id).eq('tenant_id', auth.tenantId),
      loadStockPolicy(auth.tenantId, location_id),
      fetchProductTracking(auth.tenantId),
    ])
    const locPrices = locPricesRes.data
    const locProds = locProdsRes.data

    const sm = {}; (stockRows || []).forEach(s => { sm[s.product_id] = s.quantity })

    // Filtrar productos deshabilitados para este punto
    const disabledProductIds = new Set(
      (locProds || []).filter(lp => lp.active === false).map(lp => lp.product_id)
    )
    if (disabledProductIds.size > 0 && !includeInactive) {
      result = result.filter(p => !disabledProductIds.has(p.id))
    }

    // Aplicar precios diferenciales por presentación
    const priceMap = new Map()
    ;(locPrices || []).forEach(lp => {
      if (lp.price !== null && lp.price !== undefined) priceMap.set(lp.presentation_id, Number(lp.price))
    })

    result = result.map(p => ({
      ...p,
      ...trackingMeta(tracking.get(p.id)),
      ...stockFields(tracking.get(p.id), sm[p.id], { tenant: auth.tenant, location: policy.location, threshold: policy.threshold }),
      presentations: (p.presentations || []).map(pr => {
        if (priceMap.has(pr.id)) {
          const diffPrice = priceMap.get(pr.id)
          return { ...pr, base_price: pr.price, price: diffPrice, is_differential: true }
        }
        return pr
      })
    }))
  } else if (auth.tenant?.has_inventory) {
    try {
      const [{ data: stockRows }, policy, tracking] = await Promise.all([
        supabaseAdmin.from('stock').select('product_id, quantity').eq('tenant_id', auth.tenantId),
        loadStockPolicy(auth.tenantId),
        fetchProductTracking(auth.tenantId),
      ])
      const sm = {}
      ;(stockRows || []).forEach(s => {
        sm[s.product_id] = (sm[s.product_id] || 0) + Number(s.quantity || 0)
      })
      result = result.map(p => ({
        ...p,
        ...trackingMeta(tracking.get(p.id)),
        ...stockFields(tracking.get(p.id), sm[p.id], { tenant: auth.tenant, location: null, threshold: policy.threshold }),
      }))
    } catch {
      // Ignorar si la tabla stock no existe aún
    }
  }
  result.sort(compareProducts)
  // Respuesta por-tenant en URL compartida: private evita CDNs compartidos y
  // Vary: Authorization separa las entradas por token (HTTP y Cache API del SW).
  res.setHeader('Cache-Control', includeInactive ? 'private, no-store' : 'private, max-age=300')
  res.setHeader('Vary', 'Authorization')
  return res.status(200).json(result)
}

export async function productsCreate(req, res) {
  const auth = await requireCan(req, res, 'manage_catalog'); if (!auth) return
  const { name, category_id, description, image_url, presentations = [], stock, initial_stock, location_id, track_stock, min_stock } = req.body || {}
  if (!name) return res.status(400).json({ error: 'El nombre es requerido' })
  if (!(await tenantOwns('categories', category_id, auth.tenantId))) return res.status(403).json({ error: 'Referencia inválida para esta empresa' })
  if (!validateImageUrl(image_url, auth.tenantId)) return res.status(400).json({ error: 'URL de imagen inválida' })
  const settings = parseStockSettings({ track_stock, min_stock })
  if (settings.error) return res.status(400).json({ error: settings.error })
  const { data: product, error: pe } = await supabaseAdmin.from('products')
    .insert({ tenant_id: auth.tenantId, name, category_id, description, ...(image_url ? { image_url } : {}), ...settings.fields }).select().single()
  if (pe) return res.status(500).json({ error: imageErrMsg(pe) })
  if (presentations.length > 0) {
    await supabaseAdmin.from('presentations')
      .insert(presentations.map(p => ({ tenant_id: auth.tenantId, product_id: product.id, label: p.label, price: p.price })))
  }

  // Inicializar stock si se proporcionó
  const stockQty = stock ?? initial_stock
  if (stockQty !== undefined && !isNaN(Number(stockQty))) {
    await initProductStock(auth.tenantId, product.id, Number(stockQty), location_id || null).catch(() => {})
  }

  const { data: full } = await supabaseAdmin.from('products')
    .select('*, categories(*), presentations(*)').eq('id', product.id).eq('tenant_id', auth.tenantId).single()
  return res.status(201).json(full)
}

export async function productsUpdate(req, res, id) {
  const auth = await requireCan(req, res, 'manage_catalog'); if (!auth) return
  const { name, category_id, description, image_url, active, presentations, stock, location_id, track_stock, min_stock } = req.body || {}
  if (category_id !== undefined && !(await tenantOwns('categories', category_id, auth.tenantId))) return res.status(403).json({ error: 'Referencia inválida para esta empresa' })
  if (!validateImageUrl(image_url, auth.tenantId)) return res.status(400).json({ error: 'URL de imagen inválida' })
  const settings = parseStockSettings({ track_stock, min_stock })
  if (settings.error) return res.status(400).json({ error: settings.error })
  const u = { ...settings.fields }
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

  // Actualizar stock si se proporcionó
  if (stock !== undefined && !isNaN(Number(stock))) {
    if (location_id) {
      await adjustStock(auth.tenantId, location_id, id, Number(stock), 'manual_adjustment', auth.seller?.id).catch(() => {})
    } else {
      await initProductStock(auth.tenantId, id, Number(stock)).catch(() => {})
    }
  }
  const { data: full } = await supabaseAdmin.from('products')
    .select('*, categories(*), presentations(*)').eq('id', id).eq('tenant_id', auth.tenantId).single()
  return res.status(200).json(full)
}

export async function productsDelete(req, res, id) {
  const auth = await requireCan(req, res, 'manage_catalog'); if (!auth) return
  await supabaseAdmin.from('products').update({ active: false }).eq('id', id).eq('tenant_id', auth.tenantId)
  return res.status(204).end()
}

export async function productsBulkDelete(req, res) {
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

  // Limpiar fotos huérfanas del bucket (best effort)
  const paths = rows
    .map(r => r.image_url && imagePathFromUrl(r.image_url, { supabaseUrl: process.env.SUPABASE_URL }))
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

export async function productsBulk(req, res) {
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
    const namePattern = p.name.trim().replace(/([%_\\])/g, '\\$1')
    let { data: ex, error: exErr } = await supabaseAdmin.from('products')
      .select('id, image_url').eq('tenant_id', auth.tenantId).ilike('name', namePattern).limit(1)
    if (exErr && isMissingImageColumn(exErr)) {
      ;({ data: ex, error: exErr } = await supabaseAdmin.from('products')
        .select('id').eq('tenant_id', auth.tenantId).ilike('name', namePattern).limit(1))
    }
    if (exErr) { results.errors.push(`"${p.name}": ${exErr.message}`); continue }
    if (ex?.length) {
      const existing = ex[0]
      if (p.image_url && 'image_url' in existing && !existing.image_url) {
        const { error: ie } = await supabaseAdmin.from('products')
          .update({ image_url: p.image_url }).eq('id', existing.id).eq('tenant_id', auth.tenantId)
        if (ie) results.errors.push(`"${p.name}" foto: ${imageErrMsg(ie)}`)
        else results.photos_added++
      }
      if (p.stock !== undefined && !isNaN(Number(p.stock))) {
        await initProductStock(auth.tenantId, existing.id, Number(p.stock)).catch(() => {})
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
    if (p.stock !== undefined && !isNaN(Number(p.stock))) {
      await initProductStock(auth.tenantId, np.id, Number(p.stock)).catch(() => {})
    }
    results.created++
  }
  const message = `${results.created} creado(s), ${results.skipped} omitido(s)` +
    (results.photos_added ? `, ${results.photos_added} foto(s) agregada(s) a productos existentes` : '')
  return res.status(200).json({ message, ...results })
}

export async function productsUploadImage(req, res) {
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

export async function categoriesGet(req, res) {
  const auth = await requireAuth(req, res); if (!auth) return
  const { data, error } = await supabaseAdmin.from('categories')
    .select('id, name, icon, sort_order, active')
    .eq('tenant_id', auth.tenantId)
    .eq('active', true)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })
  if (error) return res.status(500).json({ error: error.message })
  res.setHeader('Cache-Control', 'private, no-store')
  return res.status(200).json(data || [])
}

export async function categoriesCreate(req, res) {
  const auth = await requireCan(req, res, 'manage_catalog'); if (!auth) return
  const { name, icon } = req.body || {}
  const trimmed = name?.trim()
  if (!trimmed) return res.status(400).json({ error: 'El nombre es requerido' })

  const namePattern = trimmed.replace(/([%_\\])/g, '\\$1')
  const { data: existing, error: exErr } = await supabaseAdmin.from('categories')
    .select('id, name, icon, sort_order, active')
    .eq('tenant_id', auth.tenantId)
    .ilike('name', namePattern)
    .limit(1)
  if (!exErr && existing?.length) return res.status(200).json(existing[0])

  const { data, error } = await supabaseAdmin.from('categories')
    .insert({ tenant_id: auth.tenantId, name: trimmed, icon: icon?.trim() || null, active: true })
    .select('id, name, icon, sort_order, active')
    .single()
  if (error) return res.status(500).json({ error: error.message })
  return res.status(201).json(data)
}
