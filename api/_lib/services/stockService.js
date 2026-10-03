/**
 * PyroVenta — Servicio de Inventario y Control de Stock
 */

import { randomUUID } from 'node:crypto'
import { supabaseAdmin } from '../supabaseAdmin.js'

export const DEFAULT_LOW_STOCK = 5

const isMissingColumn = (e) => e?.code === '42703' || e?.code === 'PGRST204'

/**
 * Agrupa items de factura por producto para totalizar la cantidad por product_id
 */
export function groupItemsByProduct(items = []) {
  const map = new Map() // productId -> totalQty
  for (const it of items) {
    const pId = it.productId || it.product_id
    const rawQty = it.qty !== undefined ? it.qty : (it.quantity !== undefined ? it.quantity : 1)
    const qty = Number(rawQty)
    if (!pId || isNaN(qty) || qty <= 0) continue
    map.set(pId, (map.get(pId) || 0) + qty)
  }
  return map
}

/**
 * ¿Este producto se controla en este punto? Única regla del sistema:
 * tenants.has_inventory AND products.track_stock AND (excepción del punto ?? locations.tracks_inventory).
 * La excepción (`location_track`, de location_products) permite que un punto sin
 * inventario controle productos concretos, o al revés.
 * Los campos ausentes (BD sin migrar) cuentan como "controlado", el comportamiento previo.
 */
export function isTracked(tenant, location, product) {
  return Boolean(tenant?.has_inventory)
    && product?.track_stock !== false
    && (product?.location_track ?? location?.tracks_inventory !== false)
}

/** Umbral efectivo de stock bajo: el del producto, o el del negocio. */
export function effectiveThreshold(product, tenantThreshold = DEFAULT_LOW_STOCK) {
  return product?.min_stock ?? tenantThreshold ?? DEFAULT_LOW_STOCK
}

/** Campos de stock que viajan en el payload de producto (catálogo e inventario). */
export function stockFields(product, quantity, { tenant, location, threshold }) {
  const stock_tracked = isTracked(tenant, location, product)
  const low_stock_threshold = effectiveThreshold(product, threshold)
  const qty = Number(quantity || 0)
  return {
    stock_quantity: qty,
    stock_tracked,
    low_stock_threshold,
    is_out_of_stock: stock_tracked && qty <= 0,
    is_low_stock: stock_tracked && qty > 0 && qty <= low_stock_threshold,
  }
}

/**
 * Umbral del negocio y flag del punto. Se leen aparte de auth/catálogo para que
 * una BD sin la migración 2026-10-02 siga funcionando con los valores previos.
 */
export async function loadStockPolicy(tenantId, locationId = null) {
  const [t, l] = await Promise.all([
    supabaseAdmin.from('tenants').select('low_stock_threshold').eq('id', tenantId).maybeSingle(),
    locationId
      ? supabaseAdmin.from('locations').select('tracks_inventory').eq('id', locationId).eq('tenant_id', tenantId).maybeSingle()
      : Promise.resolve({ data: null }),
  ])
  return {
    threshold: t?.data?.low_stock_threshold ?? DEFAULT_LOW_STOCK,
    location: l?.data ? { tracks_inventory: l.data.tracks_inventory } : null,
  }
}

/**
 * Map productId -> { track_stock, min_stock, location_track }. Vacío si la BD aún no tiene las columnas.
 * Con `locationId` suma la excepción de ese punto (location_products.track_stock).
 */
export async function fetchProductTracking(tenantId, productIds = null, locationId = null) {
  let q = supabaseAdmin.from('products').select('id, track_stock, min_stock').eq('tenant_id', tenantId)
  if (productIds) q = q.in('id', productIds)
  const { data, error } = await q
  const map = new Map()
  if (error) {
    if (!isMissingColumn(error)) console.error('[StockService] Error leyendo seguimiento de productos:', error)
    return map
  }
  for (const p of data || []) map.set(p.id, { track_stock: p.track_stock, min_stock: p.min_stock })
  if (locationId) {
    let lq = supabaseAdmin.from('location_products').select('product_id, track_stock')
      .eq('tenant_id', tenantId).eq('location_id', locationId).not('track_stock', 'is', null)
    if (productIds) lq = lq.in('product_id', productIds)
    const { data: overrides, error: lErr } = await lq
    if (lErr && !isMissingColumn(lErr)) console.error('[StockService] Error leyendo excepciones del punto:', lErr)
    for (const o of overrides || []) {
      const cur = map.get(o.product_id)
      if (cur) cur.location_track = o.track_stock
    }
  }
  return map
}

/** Unidades por producto que sí se controlan: Map productId -> qty. */
async function trackedQuantities(tenantId, locationId, items) {
  const all = groupItemsByProduct(items)
  if (all.size === 0) return all
  const [policy, tracking] = await Promise.all([
    loadStockPolicy(tenantId, locationId),
    fetchProductTracking(tenantId, [...all.keys()], locationId),
  ])
  // El llamador ya comprobó tenants.has_inventory
  const tenant = { has_inventory: true }
  const tracked = new Map()
  for (const [pId, qty] of all) {
    if (isTracked(tenant, policy.location, tracking.get(pId))) tracked.set(pId, qty)
  }
  return tracked
}

/**
 * Productos controlados del carrito que no alcanzan en este punto:
 * [{ productId, productName, available }]. Lectura previa al cobro para dar un
 * 409 claro; la garantía real contra carreras es apply_stock_delta.
 */
export async function findStockShortages(tenantId, locationId, items = []) {
  const tracked = await trackedQuantities(tenantId, locationId, items)
  if (tracked.size === 0) return []
  const { data, error } = await supabaseAdmin
    .from('stock')
    .select('product_id, quantity')
    .eq('tenant_id', tenantId)
    .eq('location_id', locationId)
    .in('product_id', [...tracked.keys()])
  if (error) throw error
  const available = new Map((data || []).map(r => [r.product_id, Number(r.quantity || 0)]))
  const names = new Map()
  for (const it of items) {
    const id = it.productId || it.product_id
    if (id && !names.has(id)) names.set(id, it.product_name || it.productName || 'producto')
  }
  const shortages = []
  for (const [pId, qty] of tracked) {
    const have = available.get(pId) || 0
    if (qty > have) shortages.push({ productId: pId, productName: names.get(pId), available: Math.max(0, have) })
  }
  return shortages
}

/** Mismo texto que el aviso del POS (src/lib/cartItem.js). */
export const shortageMessage = (s) => `Sin existencia. Quedan ${s.available} de ${s.productName}.`

/**
 * Única vía de escritura de stock: apply_stock_delta bloquea la fila, suma el delta y deja el
 * movimiento (saldo previo, usuario, referencia, lote) en la misma transacción.
 * Devuelve { data: saldo resultante, error } como cualquier llamada de supabase-js.
 */
function stockDelta({ tenantId, locationId, productId, delta, reason, invoiceId = null, userId = null, notes = null,
  reference = null, batchId = null, allowNegative = true }) {
  return supabaseAdmin.rpc('apply_stock_delta', {
    p_tenant_id:      tenantId,
    p_location_id:    locationId,
    p_product_id:     productId,
    p_delta:          delta,
    p_reason:         reason,
    p_invoice_id:     invoiceId || null,
    p_user_id:        userId || null,
    p_allow_negative: allowNegative,
    p_notes:          notes || null,
    p_reference:      reference || null,
    p_batch_id:       batchId || null,
  })
}

async function applyDeltas(tenantId, invoiceId, locationId, quantities, sign, reason, userId, notes = null) {
  const failures = []
  let applied = 0
  // Cada llamada es una transacción propia que bloquea solo la fila de ese producto
  for (const [pId, qty] of quantities) {
    // Se valida antes de cobrar; aquí la venta ya está pagada y el stock debe reflejarla
    const { error } = await stockDelta({
      tenantId, locationId, productId: pId, delta: sign * qty, reason, invoiceId, userId, notes, allowNegative: true,
    })
    if (error) {
      console.error(`[StockService] apply_stock_delta falló (${reason}, producto ${pId}):`, error)
      failures.push({ productId: pId, error: error.message })
    } else applied++
  }
  return { ok: failures.length === 0, applied, failures }
}

/**
 * Descuenta el stock de una factura cobrada (solo productos controlados).
 * opts.offline: venta sincronizada desde la cola offline; queda anotada.
 */
export async function deductStockForInvoice(tenantId, invoiceId, locationId, items = [], userId = null, opts = {}) {
  if (!tenantId || !locationId || !items.length) return { ok: false, reason: 'Parámetros insuficientes' }
  try {
    const tracked = await trackedQuantities(tenantId, locationId, items)
    if (tracked.size === 0) return { ok: true, deducted: 0 }
    const r = await applyDeltas(tenantId, invoiceId, locationId, tracked, -1, 'sale', userId,
      opts.offline ? 'Venta offline sincronizada' : null)
    return { ...r, deducted: r.applied }
  } catch (err) {
    console.error('[StockService] Excepción descontando stock:', err)
    return { ok: false, error: err.message }
  }
}

/** Reintegra el stock de una factura devuelta (solo productos controlados). */
export async function restoreStockForInvoice(tenantId, invoiceId, locationId, items = [], userId = null) {
  if (!tenantId || !locationId || !items.length) return { ok: false, reason: 'Parámetros insuficientes' }
  try {
    const tracked = await trackedQuantities(tenantId, locationId, items)
    if (tracked.size === 0) return { ok: true, restored: 0 }
    const r = await applyDeltas(tenantId, invoiceId, locationId, tracked, +1, 'refund', userId)
    return { ...r, restored: r.applied }
  } catch (err) {
    console.error('[StockService] Excepción reintegrando stock:', err)
    return { ok: false, error: err.message }
  }
}

/**
 * Fija el stock de un producto en un punto a una cantidad exacta (conteo físico, carga inicial).
 * Calcula el delta contra el saldo leído y lo aplica atómicamente: si entra una venta entre la
 * lectura y la escritura, la venta no se pierde (solo el resultado difiere del conteo).
 */
export async function adjustStock(tenantId, locationId, productId, newQuantity, reason = 'manual_adjustment', userId = null, notes = null, extra = {}) {
  const finalQty = Math.max(0, parseInt(newQuantity) || 0)

  const { data: currentStock, error: readErr } = await supabaseAdmin
    .from('stock')
    .select('quantity')
    .eq('tenant_id', tenantId)
    .eq('location_id', locationId)
    .eq('product_id', productId)
    .maybeSingle()
  if (readErr) throw readErr

  const current = currentStock ? Number(currentStock.quantity || 0) : 0
  const delta = finalQty - current
  if (delta === 0) return { ok: true, delta: 0, quantity: finalQty }

  const { data: quantity, error } = await stockDelta({
    tenantId, locationId, productId, delta, reason, userId, notes, allowNegative: true, ...extra,
  })
  if (error) {
    console.error(`[StockService] apply_stock_delta falló (${reason}, producto ${productId}):`, error)
    throw new Error(error.message)
  }
  return { ok: true, delta, quantity: quantity ?? finalQty }
}

/** Inicializa stock de un producto en uno o varios puntos (movimiento 'initial_load'). */
export async function initProductStock(tenantId, productId, initialQuantity, locationId = null, userId = null) {
  const qty = parseInt(initialQuantity)
  if (isNaN(qty) || qty < 0) return { ok: false, reason: 'Cantidad inválida' }

  let locationIds = []
  if (locationId) {
    locationIds = [locationId]
  } else {
    const { data: locs } = await supabaseAdmin
      .from('locations')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('active', true)
    locationIds = (locs || []).map(l => l.id)
  }

  if (!locationIds.length) return { ok: false, reason: 'No hay puntos de venta configurados' }

  const failures = []
  for (const locId of locationIds) {
    try { await adjustStock(tenantId, locId, productId, qty, 'initial_load', userId) }
    catch (err) { failures.push({ locationId: locId, error: err.message }) }
  }
  return { ok: failures.length === 0, locations: locationIds.length - failures.length, failures }
}

// ---- Reposición y merma ------------------------------------------------

export const MAX_RECEIVE_ITEMS = 100
export const MAX_QTY = 1_000_000

/** Valida y normaliza las líneas de una recepción. { ok, items } | { ok:false, error } */
export function validateReceiveItems(items, defaults = {}) {
  if (!Array.isArray(items) || items.length === 0) return { ok: false, error: 'Agrega al menos un producto' }
  if (items.length > MAX_RECEIVE_ITEMS) return { ok: false, error: `Máximo ${MAX_RECEIVE_ITEMS} productos por recepción` }
  const seen = new Set()
  const clean = []
  for (const it of items) {
    const productId = it?.product_id
    const qty = Number(it?.quantity)
    if (!productId || typeof productId !== 'string') return { ok: false, error: 'Cada línea requiere product_id' }
    if (!Number.isInteger(qty) || qty <= 0 || qty > MAX_QTY) return { ok: false, error: 'La cantidad debe ser un entero mayor a 0' }
    if (seen.has(productId)) return { ok: false, error: 'Hay productos repetidos en la recepción' }
    seen.add(productId)
    const reference = String(it.reference ?? defaults.reference ?? '').trim().slice(0, 100) || null
    const notes = String(it.notes ?? defaults.notes ?? '').trim().slice(0, 500) || null
    clean.push({ productId, quantity: qty, reference, notes })
  }
  return { ok: true, items: clean }
}

/** Valida una merma: cantidad entera > 0 y motivo (notes) obligatorio. */
export function validateWaste({ product_id, quantity, notes, reference } = {}) {
  const qty = Number(quantity)
  const why = String(notes ?? '').trim()
  if (!product_id) return { ok: false, error: 'product_id es requerido' }
  if (!Number.isInteger(qty) || qty <= 0 || qty > MAX_QTY) return { ok: false, error: 'La cantidad debe ser un entero mayor a 0' }
  if (why.length < 3) return { ok: false, error: 'El motivo de la merma es obligatorio' }
  return { ok: true, productId: product_id, quantity: qty, notes: why.slice(0, 500), reference: String(reference ?? '').trim().slice(0, 100) || null }
}

/**
 * Reposición (+N) de varios productos en un punto, con un lote común. Cada línea es una
 * transacción atómica propia (suma sobre el saldo real, nunca lo sobrescribe).
 * Devuelve { batchId, applied: [{productId, before, after}], failures: [{productId, error}] }.
 */
export async function receiveStock(tenantId, locationId, items, { userId = null, batchId = randomUUID() } = {}) {
  const applied = []
  const failures = []
  for (const it of items) {
    const { data: after, error } = await stockDelta({
      tenantId, locationId, productId: it.productId, delta: it.quantity, reason: 'restock',
      userId, notes: it.notes, reference: it.reference, batchId, allowNegative: true,
    })
    if (error) {
      console.error(`[StockService] reposición falló (producto ${it.productId}):`, error)
      failures.push({ productId: it.productId, error: error.message })
    } else {
      applied.push({ productId: it.productId, before: after - it.quantity, after })
    }
  }
  return { batchId, applied, failures }
}

/** Merma (−N) con motivo obligatorio. No deja el saldo bajo cero: lanza error 409 si no alcanza. */
export async function wasteStock(tenantId, locationId, w, { userId = null } = {}) {
  const { data: after, error } = await stockDelta({
    tenantId, locationId, productId: w.productId, delta: -w.quantity, reason: 'damage',
    userId, notes: w.notes, reference: w.reference, allowNegative: false,
  })
  if (error) {
    const insufficient = /INSUFFICIENT_STOCK/.test(error.message)
    if (!insufficient) console.error(`[StockService] merma falló (producto ${w.productId}):`, error)
    const e = new Error(insufficient ? 'La merma supera el stock disponible' : error.message)
    e.status = insufficient ? 409 : 500
    throw e
  }
  return { before: after + w.quantity, after }
}

/** Salidas que no son venta (merma, traslado, conteo a la baja) se resaltan en el historial. */
export const movementFlag = (m) => (Number(m?.delta) < 0 && m?.reason !== 'sale' ? 'outflow' : null)
