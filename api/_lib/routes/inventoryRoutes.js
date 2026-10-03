/**
 * PyroVenta — Rutas de Inventario y Control de Stock
 */

import { supabaseAdmin } from '../supabaseAdmin.js'
import { requireAuth, requireCan } from '../auth.js'
import { scopedLocation, denyOutOfScope } from '../scopedLocation.js'
import { tenantOwns } from '../tenantOwns.js'
import {
  adjustStock, stockFields, loadStockPolicy, fetchProductTracking, isTracked,
  validateReceiveItems, validateWaste, receiveStock, wasteStock, movementFlag,
} from '../services/stockService.js'

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
    fetchProductTracking(auth.tenantId, null, location_id || null),
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

const ADJUST_REASONS = ['manual_adjustment', 'initial_load', 'damage', 'transfer']

export async function inventoryAdjustPost(req, res) {
  const auth = await requireCan(req, res, 'manage_catalog'); if (!auth) return
  const { product_id, location_id, quantity, reason, notes } = req.body || {}

  if (!product_id || !location_id || quantity === undefined) {
    return res.status(400).json({ error: 'product_id, location_id y quantity son requeridos' })
  }

  if (denyOutOfScope(auth, location_id, res)) return
  if (reason && !ADJUST_REASONS.includes(reason)) return res.status(400).json({ error: 'Motivo inválido' })
  if (!(await tenantOwns('products', product_id, auth.tenantId))) return res.status(400).json({ error: 'Referencia inválida para esta empresa' })

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

// POST /inventory/receive — reposición (+N) de varios productos en un punto. Admin (su punto) y owner.
export async function inventoryReceivePost(req, res) {
  const auth = await requireCan(req, res, 'restock'); if (!auth) return
  const { location_id, items, reference, notes } = req.body || {}
  if (!location_id) return res.status(400).json({ error: 'location_id es requerido' })
  if (denyOutOfScope(auth, location_id, res)) return

  const v = validateReceiveItems(items, { reference, notes })
  if (!v.ok) return res.status(400).json({ error: v.error })

  // Solo se repone lo que este punto controla: de lo contrario el saldo no significaría nada
  const ids = v.items.map(i => i.productId)
  const [{ data: products }, policy, tracking] = await Promise.all([
    supabaseAdmin.from('products').select('id, name').eq('tenant_id', auth.tenantId).in('id', ids),
    loadStockPolicy(auth.tenantId, location_id),
    fetchProductTracking(auth.tenantId, ids, location_id),
  ])
  const names = new Map((products || []).map(p => [p.id, p.name]))
  if (ids.some(id => !names.has(id))) return res.status(400).json({ error: 'Referencia inválida para esta empresa' })
  const untracked = ids.filter(id => !isTracked(auth.tenant, policy.location, tracking.get(id)))
  if (untracked.length) {
    return res.status(409).json({
      error: `No se controla inventario en este punto: ${untracked.map(id => names.get(id)).join(', ')}`,
      code: 'NOT_TRACKED',
    })
  }

  const result = await receiveStock(auth.tenantId, location_id, v.items, { userId: auth.seller.id })
  const body = {
    ok: result.failures.length === 0,
    batch_id: result.batchId,
    applied: result.applied.map(a => ({ product_id: a.productId, name: names.get(a.productId), before: a.before, after: a.after })),
    failures: result.failures.map(f => ({ product_id: f.productId, name: names.get(f.productId), error: f.error })),
  }
  return res.status(body.ok ? 200 : 207).json(body)
}

// POST /inventory/waste — merma o daño (−N) con motivo obligatorio. Admin (su punto) y owner.
export async function inventoryWastePost(req, res) {
  const auth = await requireCan(req, res, 'restock'); if (!auth) return
  const { location_id } = req.body || {}
  if (!location_id) return res.status(400).json({ error: 'location_id es requerido' })
  if (denyOutOfScope(auth, location_id, res)) return

  const w = validateWaste(req.body)
  if (!w.ok) return res.status(400).json({ error: w.error })
  if (!(await tenantOwns('products', w.productId, auth.tenantId))) {
    return res.status(400).json({ error: 'Referencia inválida para esta empresa' })
  }
  try {
    const r = await wasteStock(auth.tenantId, location_id, w, { userId: auth.seller.id })
    return res.status(200).json({ ok: true, product_id: w.productId, before: r.before, after: r.after })
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message })
  }
}

const MOVEMENT_REASONS = ['sale', 'refund', 'manual_adjustment', 'initial_load', 'bulk_upload', 'restock', 'damage', 'transfer']
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/

// GET /inventory/movements — bitácora de stock. Admin: solo su punto. Owner: todos o filtrado.
export async function inventoryMovementsGet(req, res) {
  const auth = await requireCan(req, res, 'view_stock_audit'); if (!auth) return
  const { reason, product_id, from, to } = req.query
  const location_id = scopedLocation(auth, req.query.location_id, res, { allowAll: true })
  if (location_id === undefined) return
  if (reason && !MOVEMENT_REASONS.includes(reason)) return res.status(400).json({ error: 'Motivo inválido' })
  if ((from && !ISO_DAY.test(from)) || (to && !ISO_DAY.test(to))) return res.status(400).json({ error: 'Fechas inválidas (AAAA-MM-DD)' })

  const limit = Math.min(Math.max(parseInt(req.query.limit) || 100, 1), 500)
  const offset = Math.max(parseInt(req.query.offset) || 0, 0)

  let q = supabaseAdmin.from('stock_movements')
    .select('id, created_at, location_id, product_id, delta, stock_before, final_stock, reason, reference, notes, user_id, user_name, user_role, batch_id, invoice_id, products(name), locations(name)')
    .eq('tenant_id', auth.tenantId)
  q = location_id ? q.eq('location_id', location_id) : q.in('location_id', auth.scope.locationIds)
  if (reason) q = q.eq('reason', reason)
  if (product_id) q = q.eq('product_id', product_id)
  if (from) q = q.gte('created_at', `${from}T00:00:00-05:00`)
  if (to) q = q.lt('created_at', `${to}T23:59:59.999-05:00`)
  const { data, error } = await q.order('created_at', { ascending: false }).range(offset, offset + limit - 1)
  if (error) return res.status(500).json({ error: error.message })

  return res.status(200).json((data || []).map(({ products, locations, ...m }) => ({
    ...m, product_name: products?.name ?? null, location_name: locations?.name ?? null, flag: movementFlag(m),
  })))
}
