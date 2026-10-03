/**
 * PyroVenta — Rutas de Inventario y Control de Stock
 */

import { supabaseAdmin } from '../supabaseAdmin.js'
import { requireAuth, requireCan } from '../auth.js'
import { scopedLocation, denyOutOfScope } from '../scopedLocation.js'
import { adjustStock, stockFields, loadStockPolicy, fetchProductTracking } from '../services/stockService.js'

export async function inventoryGet(req, res) {
  const auth = await requireAuth(req, res); if (!auth) return
  const location_id = scopedLocation(auth, req.query.location_id, res, { allowAll: true })
  if (location_id === undefined) return

  // 1. Obtener productos activos
  const { data: products, error: pErr } = await supabaseAdmin
    .from('products')
    .select('id, name, description, image_url, active, categories(id, name)')
    .eq('tenant_id', auth.tenantId)
    .eq('active', true)
    .order('name')

  if (pErr) return res.status(500).json({ error: pErr.message })

  // 2. Obtener existencias actuales en este punto (o consolidado)
  let stockQuery = supabaseAdmin
    .from('stock')
    .select('product_id, location_id, quantity, updated_at')
    .eq('tenant_id', auth.tenantId)
  
  if (location_id) {
    stockQuery = stockQuery.eq('location_id', location_id)
  }

  const [{ data: stockRows, error: sErr }, policy, tracking] = await Promise.all([
    stockQuery,
    loadStockPolicy(auth.tenantId, location_id || null),
    fetchProductTracking(auth.tenantId),
  ])

  if (sErr) return res.status(500).json({ error: sErr.message })

  const stockMap = new Map()
  for (const row of stockRows || []) {
    const current = stockMap.get(row.product_id) || { quantity: 0, updated_at: row.updated_at }
    stockMap.set(row.product_id, {
      quantity: current.quantity + Number(row.quantity || 0),
      updated_at: (!current.updated_at || (row.updated_at && row.updated_at > current.updated_at))
        ? row.updated_at
        : current.updated_at,
    })
  }

  const result = (products || []).map(p => {
    const s = stockMap.get(p.id)
    const t = tracking.get(p.id)
    return {
      ...p,
      track_stock: t?.track_stock !== false,
      min_stock: t?.min_stock ?? null,
      ...stockFields(t, s?.quantity, { tenant: auth.tenant, location: policy.location, threshold: policy.threshold }),
      stock_updated_at: s ? s.updated_at : null,
    }
  })

  return res.status(200).json(result)
}

export async function inventoryAdjustPost(req, res) {
  const auth = await requireCan(req, res, 'manage_catalog'); if (!auth) return
  const { product_id, location_id, quantity, reason, notes } = req.body || {}

  if (!product_id || !location_id || quantity === undefined) {
    return res.status(400).json({ error: 'product_id, location_id y quantity son requeridos' })
  }

  if (denyOutOfScope(auth, location_id, res)) return

  const qty = parseInt(quantity)
  if (isNaN(qty) || qty < 0) {
    return res.status(400).json({ error: 'La cantidad debe ser un número entero mayor o igual a 0' })
  }

  try {
    const updated = await adjustStock(
      auth.tenantId,
      location_id,
      product_id,
      qty,
      reason || 'manual_adjustment',
      auth.seller?.id || null,
      notes || null
    )
    return res.status(200).json(updated)
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
