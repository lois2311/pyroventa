import { supabaseAdmin } from '../supabaseAdmin.js'
import { requireAuth, requireCan } from '../auth.js'
import { scopedLocation, denyOutOfScope, loadScopedRegister } from '../scopedLocation.js'
import { tenantOwns } from '../tenantOwns.js'
import { buildInvoiceItems } from '../invoiceItems.js'
import { parseRange, bogotaDayBounds } from '../range.js'
import { CLOSURES_MIGRATION_HINT } from './closureRoutes.js'
import { deductStockForInvoice, restoreStockForInvoice, findStockShortages, shortageMessage } from '../services/stockService.js'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const UNIQUE_VIOLATION = '23505'

export const TRANSFER_PROVIDERS = ['nequi', 'daviplata', 'bancolombia']

// Se degrada una vez por instancia si falta la migración; vuelve a true al reciclar
export let invoicesHaveTransferProvider = true
export const isMissingTransferProviderColumn = (e) =>
  (e?.code === '42703' || e?.code === 'PGRST204') && /transfer_provider/.test(e?.message || '')

// Idempotencia: se degrada una vez por instancia si falta la migración
let invoicesHaveClientOpId = true
const isMissingClientOpIdColumn = (e) =>
  (e?.code === '42703' || e?.code === 'PGRST204') && /client_op_id/.test(e?.message || '')

/**
 * Catálogo autoritativo para cotizar: precio, etiqueta y nombre salen de la BD,
 * nunca del body. Solo presentaciones activas del propio tenant.
 */
export async function fetchPresentationCatalog(tenantId, clientItems, locationId = null) {
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
  if (locationId) {
    const { data: locPrices } = await supabaseAdmin.from('location_prices')
      .select('presentation_id, price')
      .eq('tenant_id', tenantId).eq('location_id', locationId).in('presentation_id', ids)
    if (locPrices?.length) {
      for (const lp of locPrices) {
        const item = map.get(lp.presentation_id)
        if (item && lp.price !== null && lp.price !== undefined) {
          item.price = Number(lp.price)
        }
      }
    }
  }
  return { map }
}

const findByClientOpId = async (tenantId, clientOpId) => {
  const { data, error } = await supabaseAdmin.from('invoices')
    .select('*').eq('tenant_id', tenantId).eq('client_op_id', clientOpId).limit(1).maybeSingle()
  if (error && isMissingClientOpIdColumn(error)) invoicesHaveClientOpId = false
  return data || null
}

export async function invoicesCreate(req, res) {
  const auth = await requireCan(req, res, 'sell'); if (!auth) return
  const { seller_id, seller_name, location_name, items, client_op_id } = req.body || {}
  if (!seller_id || !Array.isArray(items) || !items.length) return res.status(400).json({ error: 'location_id, seller_id e items requeridos' })
  if (client_op_id != null && !UUID_RE.test(String(client_op_id))) {
    return res.status(400).json({ error: 'client_op_id inválido' })
  }
  const location_id = scopedLocation(auth, req.body?.location_id, res)
  if (location_id === undefined) return
  if (!(await tenantOwns('sellers', seller_id, auth.tenantId))) return res.status(403).json({ error: 'Referencia inválida para esta empresa' })

  // Reintento de una petición cuya respuesta se perdió
  if (client_op_id && invoicesHaveClientOpId) {
    const previo = await findByClientOpId(auth.tenantId, client_op_id)
    if (previo) return res.status(200).json(previo)
  }

  // Precio, nombre y etiqueta salen de la BD
  const catalog = await fetchPresentationCatalog(auth.tenantId, items, location_id)
  if (catalog.error) return res.status(catalog.status).json({ error: catalog.error })
  const built = buildInvoiceItems(items, catalog.map)
  if (built.error) return res.status(400).json({ error: built.error })
  if (built.auditLogs?.length && auth.seller?.role !== 'owner') {
    return res.status(403).json({ error: 'Solo el superadministrador puede modificar precios de los productos' })
  }

  for (let intento = 0; intento < 5; intento++) {
    const { data: code, error: ce } = await supabaseAdmin.rpc('get_next_invoice_code', { p_location_id: location_id })
    if (ce || !code) return res.status(500).json({ error: 'No se pudo generar código' })

    const insertPayload = {
      tenant_id: auth.tenantId, code, location_id, location_name, seller_id, seller_name,
      total: built.total, status: 'pending', items: built.items,
      ...(client_op_id && invoicesHaveClientOpId ? { client_op_id } : {}),
    }

    const { data: invoice, error: ie } = await supabaseAdmin.from('invoices').insert(insertPayload).select().single()

    if (!ie) {
      if (built.auditLogs?.length) {
        const auditRows = built.auditLogs.map(a => ({
          tenant_id:          auth.tenantId,
          location_id,
          location_name:      location_name || null,
          invoice_id:         invoice.id,
          invoice_code:       invoice.code,
          user_id:            auth.seller.id,
          user_name:          auth.seller.name,
          user_role:          auth.seller.role,
          presentation_id:    a.presentation_id,
          product_id:         a.product_id,
          product_name:       a.product_name,
          presentation_label: a.presentation_label,
          original_price:     a.original_price,
          edited_price:       a.edited_price,
          difference:         a.difference,
          qty:                a.qty,
          total_difference:   a.total_difference,
          reason:             a.reason,
          stage:              'cart_creation',
        }))
        await supabaseAdmin.from('price_audit_logs').insert(auditRows)
      }
      return res.status(201).json(invoice)
    }

    if (invoicesHaveClientOpId && isMissingClientOpIdColumn(ie)) {
      invoicesHaveClientOpId = false
      continue
    }
    if (ie.code === UNIQUE_VIOLATION) {
      if (client_op_id && /client_op_id/.test(ie.message || '')) {
        const previo = await findByClientOpId(auth.tenantId, client_op_id)
        if (previo) return res.status(200).json(previo)
      }
      continue
    }
    return res.status(500).json({ error: ie.message })
  }
  return res.status(503).json({ error: 'El punto de venta está saturado, intenta de nuevo' })
}

export async function invoicesPending(req, res) {
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

export async function invoicesGetByCode(req, res, code) {
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

export async function invoicesPay(req, res, code) {
  const auth = await requireCan(req, res, 'charge'); if (!auth) return
  const { pay_method, observations, register_id, register_name, discount, discount_reason, transfer_provider, offline_sync } = req.body || {}
  const location_id = scopedLocation(auth, req.body?.location_id, res)
  if (location_id === undefined) return
  if (!pay_method) return res.status(400).json({ error: 'location_id y pay_method requeridos' })
  if (!['cash', 'transfer', 'card'].includes(pay_method)) return res.status(400).json({ error: 'pay_method inválido' })
  if (register_id) {
    const reg = await loadScopedRegister(auth, register_id, res); if (!reg) return
    if (reg.location_id !== location_id) return res.status(403).json({ error: 'La caja no pertenece a este punto de venta' })
  }

  if (transfer_provider !== undefined && transfer_provider !== null) {
    if (!TRANSFER_PROVIDERS.includes(transfer_provider)) {
      return res.status(400).json({ error: 'Transferencia inválida: usa Nequi, Daviplata o Bancolombia' })
    }
    if (pay_method !== 'transfer') {
      return res.status(400).json({ error: 'El detalle de transferencia solo aplica a pagos por transferencia' })
    }
  }

  const d = Number(discount || 0)
  if (isNaN(d) || d < 0) return res.status(400).json({ error: 'Descuento inválido' })
  const discountUpdate = {}
  // El motivo queda en la factura. Una venta de la cola offline ya ocurrió: no se rechaza.
  const dReason = String(discount_reason || '').trim().slice(0, 200)
  if (d > 0 && !dReason && !offline_sync) return res.status(400).json({ error: 'El descuento requiere un motivo' })
  if (d > 0) {
    const { data: cur } = await supabaseAdmin.from('invoices')
      .select('total').eq('tenant_id', auth.tenantId).eq('code', code)
      .eq('location_id', location_id).eq('status', 'pending').single()
    if (!cur) return res.status(409).json({ error: 'Factura no existe, ya cobrada o cancelada' })
    if (d > Number(cur.total)) return res.status(400).json({ error: 'El descuento no puede superar el total' })
    discountUpdate.discount = d
    discountUpdate.discount_reason = dReason || null
    discountUpdate.discount_by = auth.seller.id
    discountUpdate.discount_by_name = auth.seller.name
    discountUpdate.total = Number(cur.total) - d
  }

  // Stock: se valida antes de cobrar. Una venta de la cola offline ya ocurrió
  // en el mostrador, así que se acepta aunque el saldo quede negativo.
  const offline = offline_sync === true
  if (auth.tenant?.has_inventory && !offline) {
    const { data: pend } = await supabaseAdmin.from('invoices')
      .select('items').eq('tenant_id', auth.tenantId).eq('code', code)
      .eq('location_id', location_id).eq('status', 'pending').maybeSingle()
    if (pend?.items) {
      let shortages
      try { shortages = await findStockShortages(auth.tenantId, location_id, pend.items) }
      catch (e) { return res.status(500).json({ error: e.message }) }
      if (shortages.length) {
        return res.status(409).json({ error: shortages.map(shortageMessage).join(' '), shortages })
      }
    }
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
  if (error && invoicesHaveTransferProvider && isMissingTransferProviderColumn(error)) {
    invoicesHaveTransferProvider = false
    ;({ data, error } = await payInvoice(false))
  }
  if (error) return res.status(500).json({ error: /discount_(reason|by)/.test(error.message) ? 'Falta la migración: ejecuta supabase/migrations/2026-10-02_discount_reason.sql en Supabase' : /discount/.test(error.message) ? CLOSURES_MIGRATION_HINT : error.message })
  if (!data) return res.status(409).json({ error: 'Factura no existe, ya cobrada o cancelada' })

  // Descuento automático de inventario si el tenant tiene la opción habilitada
  // Atómico por producto (apply_stock_delta). El cobro ya quedó firme: si el
  // descuento falla se avisa en la respuesta para que no pase desapercibido.
  if (auth.tenant?.has_inventory) {
    const st = await deductStockForInvoice(auth.tenantId, data.id, location_id, data.items, auth.seller?.id, { offline })
    if (!st.ok) return res.status(200).json({ ...data, stock_warning: 'El cobro se registró pero el inventario no se actualizó. Ajusta el stock manualmente.' })
  }

  return res.status(200).json(data)
}

export async function invoicesRefund(req, res, id) {
  const auth = await requireCan(req, res, 'refund'); if (!auth) return
  const { data: inv } = await supabaseAdmin.from('invoices')
    .select('id, location_id, items').eq('id', id).eq('tenant_id', auth.tenantId).single()
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

  // Reintegración automática de inventario si el tenant tiene la opción habilitada
  if (auth.tenant?.has_inventory) {
    const st = await restoreStockForInvoice(auth.tenantId, data.id, data.location_id, data.items || inv.items, auth.seller?.id)
    if (!st.ok) return res.status(200).json({ ...data, stock_warning: 'La devolución se registró pero el inventario no se actualizó. Ajusta el stock manualmente.' })
  }

  return res.status(200).json(data)
}

export async function invoicesCancel(req, res, code) {
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

export async function invoicesEdit(req, res, code) {
  const auth = await requireCan(req, res, 'charge'); if (!auth) return
  const { items, observations } = req.body || {}
  const location_id = scopedLocation(auth, req.body?.location_id, res)
  if (location_id === undefined) return
  const { data: existing } = await supabaseAdmin.from('invoices')
    .select('id, location_name').eq('tenant_id', auth.tenantId).eq('code', code).eq('location_id', location_id).eq('status', 'pending').single()
  if (!existing) return res.status(404).json({ error: 'Factura pendiente no encontrada' })
  const u = { edited_by: auth.seller.id, edited_at: new Date().toISOString() }
  let auditLogsToInsert = null
  if (items !== undefined) {
    if (!Array.isArray(items) || !items.length) return res.status(400).json({ error: 'items vacío' })
    const catalog = await fetchPresentationCatalog(auth.tenantId, items, location_id)
    if (catalog.error) return res.status(catalog.status).json({ error: catalog.error })
    const built = buildInvoiceItems(items, catalog.map)
    if (built.error) return res.status(400).json({ error: built.error })
    if (built.auditLogs?.length && auth.seller?.role !== 'owner') {
      return res.status(403).json({ error: 'Solo el superadministrador puede modificar precios de los productos' })
    }
    u.items = built.items; u.total = built.total
    auditLogsToInsert = built.auditLogs
  }
  if (observations !== undefined) u.observations = observations || null
  const { data, error } = await supabaseAdmin.from('invoices')
    .update(u).eq('id', existing.id).eq('status', 'pending').select().single()
  if (error) return res.status(500).json({ error: error.message })

  if (auditLogsToInsert?.length && data) {
    const auditRows = auditLogsToInsert.map(a => ({
      tenant_id:          auth.tenantId,
      location_id,
      location_name:      data.location_name || existing.location_name || null,
      invoice_id:         data.id,
      invoice_code:       data.code,
      user_id:            auth.seller.id,
      user_name:          auth.seller.name,
      user_role:          auth.seller.role,
      presentation_id:    a.presentation_id,
      product_id:         a.product_id,
      product_name:       a.product_name,
      presentation_label: a.presentation_label,
      original_price:     a.original_price,
      edited_price:       a.edited_price,
      difference:         a.difference,
      qty:                a.qty,
      total_difference:   a.total_difference,
      reason:             a.reason,
      stage:              'invoice_edit',
    }))
    await supabaseAdmin.from('price_audit_logs').insert(auditRows)
  }
  return res.status(200).json(data)
}

export async function invoicesHistory(req, res) {
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
