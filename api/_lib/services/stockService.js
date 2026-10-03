/**
 * PyroVenta — Servicio de Inventario y Control de Stock
 */

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
 * tenants.has_inventory AND locations.tracks_inventory AND products.track_stock.
 * Los campos ausentes (BD sin migrar) cuentan como "controlado", el comportamiento previo.
 */
export function isTracked(tenant, location, product) {
  return Boolean(tenant?.has_inventory)
    && location?.tracks_inventory !== false
    && product?.track_stock !== false
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

/** Map productId -> { track_stock, min_stock }. Vacío si la BD aún no tiene las columnas. */
export async function fetchProductTracking(tenantId, productIds = null) {
  let q = supabaseAdmin.from('products').select('id, track_stock, min_stock').eq('tenant_id', tenantId)
  if (productIds) q = q.in('id', productIds)
  const { data, error } = await q
  const map = new Map()
  if (error) {
    if (!isMissingColumn(error)) console.error('[StockService] Error leyendo seguimiento de productos:', error)
    return map
  }
  for (const p of data || []) map.set(p.id, { track_stock: p.track_stock, min_stock: p.min_stock })
  return map
}

/** Unidades por producto que sí se controlan: Map productId -> qty. */
async function trackedQuantities(tenantId, locationId, items) {
  const all = groupItemsByProduct(items)
  if (all.size === 0) return all
  const [policy, tracking] = await Promise.all([
    loadStockPolicy(tenantId, locationId),
    fetchProductTracking(tenantId, [...all.keys()]),
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

async function applyDeltas(tenantId, invoiceId, locationId, quantities, sign, reason, userId, notes = null) {
  const failures = []
  let applied = 0
  // Cada llamada es una transacción propia que bloquea solo la fila de ese producto
  for (const [pId, qty] of quantities) {
    const { error } = await supabaseAdmin.rpc('apply_stock_delta', {
      p_tenant_id:      tenantId,
      p_location_id:    locationId,
      p_product_id:     pId,
      p_delta:          sign * qty,
      p_reason:         reason,
      p_invoice_id:     invoiceId || null,
      p_user_id:        userId || null,
      // Se valida antes de cobrar; aquí la venta ya está pagada y el stock debe reflejarla
      p_allow_negative: true,
      p_notes:          notes,
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
 * Ajusta manualmente el stock de un producto en un punto de venta
 */
export async function adjustStock(tenantId, locationId, productId, newQuantity, reason = 'manual_adjustment', userId = null, notes = null) {
  const finalQty = Math.max(0, parseInt(newQuantity) || 0)

  const { data: currentStock } = await supabaseAdmin
    .from('stock')
    .select('quantity')
    .eq('tenant_id', tenantId)
    .eq('location_id', locationId)
    .eq('product_id', productId)
    .maybeSingle()

  const current = currentStock ? Number(currentStock.quantity || 0) : 0
  const delta = finalQty - current

  const { data, error } = await supabaseAdmin
    .from('stock')
    .upsert({
      tenant_id:   tenantId,
      location_id: locationId,
      product_id:  productId,
      quantity:    finalQty,
      updated_at:  new Date().toISOString(),
    }, { onConflict: 'product_id, location_id' })
    .select()
    .single()

  if (error) throw error

  // Registrar auditoría
  await supabaseAdmin.from('stock_movements').insert({
    tenant_id:   tenantId,
    location_id: locationId,
    product_id:  productId,
    delta,
    final_stock: finalQty,
    reason,
    user_id:     userId,
    notes,
  }).catch(() => {})

  return { ...data, ok: true, delta, quantity: finalQty }
}

/**
 * Inicializa stock de un producto en uno o varios puntos
 */
export async function initProductStock(tenantId, productId, initialQuantity, locationId = null) {
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

  const rows = locationIds.map(locId => ({
    tenant_id:   tenantId,
    product_id:  productId,
    location_id: locId,
    quantity:    qty,
    updated_at:  new Date().toISOString(),
  }))

  await supabaseAdmin.from('stock').upsert(rows, { onConflict: 'product_id, location_id' })

  const movements = locationIds.map(locId => ({
    tenant_id:   tenantId,
    location_id: locId,
    product_id:  productId,
    delta:       qty,
    final_stock: qty,
    reason:      'initial_load',
  }))

  await supabaseAdmin.from('stock_movements').insert(movements).catch(() => {})

  return { ok: true, locations: locationIds.length }
}
