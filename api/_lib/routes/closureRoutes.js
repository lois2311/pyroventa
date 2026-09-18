import { supabaseAdmin } from '../supabaseAdmin.js'
import { requireCan } from '../auth.js'
import { bogotaDate } from '../tenantStatus.js'
import { scopedLocation, loadScopedRegister } from '../scopedLocation.js'
import { parseRange } from '../range.js'

export const CLOSURES_MIGRATION_HINT = 'Falta la migración: ejecuta supabase/migrations/2026-07-21_caja_v2.sql en Supabase'
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

export async function closuresSummary(req, res) {
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

export async function closuresCreate(req, res) {
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

export async function closuresList(req, res) {
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
