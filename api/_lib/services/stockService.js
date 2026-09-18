/**
 * PyroVenta — Servicio de Inventario y Control de Stock
 */

import { supabaseAdmin } from '../supabaseAdmin.js'

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
 * Descuenta el stock de una factura cobrada y registra el movimiento
 */
export async function deductStockForInvoice(tenantId, invoiceId, locationId, items = [], userId = null) {
  if (!tenantId || !locationId || !items.length) return { ok: false, reason: 'Parámetros insuficientes' }

  try {
    const productQuantities = groupItemsByProduct(items)
    if (productQuantities.size === 0) return { ok: true, deducted: 0 }

    const productIds = Array.from(productQuantities.keys())

    // Obtener existencias actuales
    const { data: currentStockRows } = await supabaseAdmin
      .from('stock')
      .select('product_id, quantity')
      .eq('tenant_id', tenantId)
      .eq('location_id', locationId)
      .in('product_id', productIds)

    const stockMap = new Map()
    for (const row of currentStockRows || []) {
      stockMap.set(row.product_id, Number(row.quantity || 0))
    }

    const updates = []
    const movements = []

    for (const [pId, qtyToDeduct] of productQuantities.entries()) {
      const current = stockMap.get(pId) || 0
      const finalStock = current - qtyToDeduct

      updates.push({
        tenant_id:   tenantId,
        product_id:  pId,
        location_id: locationId,
        quantity:    finalStock,
        updated_at:  new Date().toISOString(),
      })

      movements.push({
        tenant_id:   tenantId,
        location_id: locationId,
        product_id:  pId,
        delta:       -qtyToDeduct,
        final_stock: finalStock,
        reason:      'sale',
        invoice_id:  invoiceId || null,
        user_id:     userId || null,
      })
    }

    // Guardar stock actualizado
    const { error: stockErr } = await supabaseAdmin
      .from('stock')
      .upsert(updates, { onConflict: 'product_id, location_id' })

    if (stockErr) {
      console.error('[StockService] Error actualizando stock en venta:', stockErr)
      return { ok: false, error: stockErr.message }
    }

    // Registrar bitácora de movimientos (best-effort)
    await supabaseAdmin
      .from('stock_movements')
      .insert(movements)
      .catch(err => console.error('[StockService] Error insertando movimientos:', err))

    return { ok: true, deducted: productQuantities.size }
  } catch (err) {
    console.error('[StockService] Excepción descontando stock:', err)
    return { ok: false, error: err.message }
  }
}

/**
 * Reintegra el stock de una factura devuelta (refund)
 */
export async function restoreStockForInvoice(tenantId, invoiceId, locationId, items = [], userId = null) {
  if (!tenantId || !locationId || !items.length) return { ok: false, reason: 'Parámetros insuficientes' }

  try {
    const productQuantities = groupItemsByProduct(items)
    if (productQuantities.size === 0) return { ok: true, restored: 0 }

    const productIds = Array.from(productQuantities.keys())

    const { data: currentStockRows } = await supabaseAdmin
      .from('stock')
      .select('product_id, quantity')
      .eq('tenant_id', tenantId)
      .eq('location_id', locationId)
      .in('product_id', productIds)

    const stockMap = new Map()
    for (const row of currentStockRows || []) {
      stockMap.set(row.product_id, Number(row.quantity || 0))
    }

    const updates = []
    const movements = []

    for (const [pId, qtyToRestore] of productQuantities.entries()) {
      const current = stockMap.get(pId) || 0
      const finalStock = current + qtyToRestore

      updates.push({
        tenant_id:   tenantId,
        product_id:  pId,
        location_id: locationId,
        quantity:    finalStock,
        updated_at:  new Date().toISOString(),
      })

      movements.push({
        tenant_id:   tenantId,
        location_id: locationId,
        product_id:  pId,
        delta:       +qtyToRestore,
        final_stock: finalStock,
        reason:      'refund',
        invoice_id:  invoiceId || null,
        user_id:     userId || null,
      })
    }

    const { error: stockErr } = await supabaseAdmin
      .from('stock')
      .upsert(updates, { onConflict: 'product_id, location_id' })

    if (stockErr) {
      console.error('[StockService] Error reintegrando stock en devolución:', stockErr)
      return { ok: false, error: stockErr.message }
    }

    await supabaseAdmin
      .from('stock_movements')
      .insert(movements)
      .catch(err => console.error('[StockService] Error insertando movimientos de devolución:', err))

    return { ok: true, restored: productQuantities.size }
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
