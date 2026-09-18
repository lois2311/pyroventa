import { supabaseAdmin } from '../supabaseAdmin.js'
import { requireCan } from '../auth.js'
import { scopedLocation, loadScopedRegister } from '../scopedLocation.js'
import { parseRange, previousPeriod, bogotaDayBounds } from '../range.js'
import { TRANSFER_PROVIDERS, isMissingTransferProviderColumn } from './invoiceRoutes.js'

let localHaveTransferProvider = true

/**
 * Desglose de las transferencias por billetera/banco dentro de un rango.
 * Devuelve pesos por proveedor, más `sin_detalle` para las que se cobraron
 * antes de que existiera el campo.
 */
async function transferBreakdown(tenantId, { from, to, location_id, seller_id, register_id }) {
  if (!localHaveTransferProvider) return null
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
    if (isMissingTransferProviderColumn(error)) localHaveTransferProvider = false
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
    invoicesQuery(localHaveTransferProvider),
    transferBreakdown(auth.tenantId, { from, to, location_id, seller_id, register_id }),
  ])
  if (invs.error && isMissingTransferProviderColumn(invs.error)) {
    localHaveTransferProvider = false
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

export async function reportDaily(req, res) {
  const auth = await requireCan(req, res, 'view_reports'); if (!auth) return
  let range
  try { range = parseRange(req.query) } catch (e) { return res.status(e.status || 400).json({ error: e.message }) }
  const { from, to } = range
  const location_id = scopedLocation(auth, req.query.location_id, res, { allowAll: true })
  if (location_id === undefined) return

  const prevRange = previousPeriod(from, to)

  const [{ data: summaryRows, error }, providers, { data: prevRows, error: prevErr }] = await Promise.all([
    supabaseAdmin.rpc('report_range_summary', {
      p_tenant_id: auth.tenantId, p_from: from, p_to: to,
      p_location_id: location_id || null,
    }),
    transferBreakdown(auth.tenantId, { from, to, location_id }),
    supabaseAdmin.rpc('report_range_summary', {
      p_tenant_id: auth.tenantId, p_from: prevRange.from, p_to: prevRange.to,
      p_location_id: location_id || null,
    }),
  ])
  if (error) return res.status(500).json({ error: error.message })
  const s = summaryRows?.[0] || {}
  const tr = Number(s.total_revenue || 0), ic = Number(s.invoice_count || 0)

  const p = !prevErr ? (prevRows?.[0] || {}) : {}
  const prevTr = Number(p.total_revenue || 0), prevIc = Number(p.invoice_count || 0)

  const result = {
    from, to,
    date: from === to ? from : undefined,
    location_id: location_id || null,
    total_revenue: tr,
    invoice_count: ic,
    avg_ticket: ic > 0 ? tr / ic : 0,
    pending_count: Number(s.pending_count || 0),
    cancelled_count: Number(s.cancelled_count || 0),
    by_pay_method: { cash: Number(s.cash || 0), transfer: Number(s.transfer || 0), card: Number(s.card || 0) },
    by_transfer_provider: providers,
    by_day: [],
    by_location: [],
    previous: prevErr ? null : {
      from: prevRange.from, to: prevRange.to,
      total_revenue: prevTr,
      invoice_count: prevIc,
      avg_ticket: prevIc > 0 ? prevTr / prevIc : 0,
    },
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

export async function reportSellers(req, res) {
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

export async function reportRegisters(req, res) {
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

export async function reportLocations(req, res) {
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

export async function reportTopProducts(req, res) {
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

export async function reportByCategory(req, res) {
  const auth = await requireCan(req, res, 'view_reports'); if (!auth) return
  let range
  try { range = parseRange(req.query) } catch (e) { return res.status(e.status || 400).json({ error: e.message }) }
  const { seller_id, register_id } = req.query
  const location_id = scopedLocation(auth, req.query.location_id, res, { allowAll: true })
  if (location_id === undefined) return
  const { data, error } = await supabaseAdmin.rpc('report_range_by_category', {
    p_tenant_id: auth.tenantId, p_from: range.from, p_to: range.to,
    p_location_id: location_id || null,
    p_seller_id: seller_id || null,
    p_register_id: register_id || null,
  })
  if (error) return res.status(500).json({ error: error.message })
  return res.status(200).json((data || []).map(r => ({
    category_id:   r.category_id,
    category_name: r.category_name || 'Sin categoría',
    category_icon: r.category_icon || null,
    total_qty:     Number(r.total_qty || 0),
    total_revenue: Number(r.total_revenue || 0),
  })).sort((a, b) => b.total_revenue - a.total_revenue))
}

export async function reportSellerDetail(req, res) {
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

export async function reportRegisterDetail(req, res) {
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

export async function auditPriceChangesGet(req, res) {
  const auth = await requireCan(req, res, 'view_reports'); if (!auth) return
  const { location_id: reqLoc, from, to, seller_id, limit = '50', offset = '0' } = req.query
  const location_id = scopedLocation(auth, reqLoc, res, { allowAll: true })
  if (location_id === undefined) return

  let q = supabaseAdmin.from('price_audit_logs')
    .select('*', { count: 'exact' })
    .eq('tenant_id', auth.tenantId)
    .order('created_at', { ascending: false })
    .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1)

  if (location_id) {
    q = q.eq('location_id', location_id)
  } else if (auth.scope?.locationIds?.length) {
    q = q.in('location_id', auth.scope.locationIds)
  }

  if (from) {
    q = q.gte('created_at', `${from}T00:00:00.000Z`)
  }
  if (to) {
    q = q.lte('created_at', `${to}T23:59:59.999Z`)
  }
  if (seller_id) {
    q = q.eq('user_id', seller_id)
  }

  const { data, error, count } = await q
  if (error) return res.status(500).json({ error: error.message })
  return res.status(200).json({ logs: data || [], total: count || 0 })
}
