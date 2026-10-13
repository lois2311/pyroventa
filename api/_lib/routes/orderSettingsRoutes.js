import { supabaseAdmin } from '../supabaseAdmin.js'
import { requireCan } from '../auth.js'
import { scopedLocation } from '../scopedLocation.js'
import { PAYMENT_METHODS } from '../orderRules.js'

// =====================================================
// Vendra Pedidos — configuración comercial por sede (permiso manage_connect).
// La tarifa del piloto es la de UNA zona activa de delivery_zones (decisión ratificada).
// =====================================================

const UNIQUE_VIOLATION = '23505'
const SLUG_RE = /^[a-z0-9-]{3,64}$/
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/
const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
export const ACCEPT_POLICIES = ['require_verified', 'allow_pending_transfer']
const DEFAULTS = {
  enabled: false, public_slug: null, currency: 'COP', quote_ttl_minutes: 15,
  payment_methods: ['cash_on_delivery'], accept_policy: 'require_verified',
  business_hours: {}, transfer_details: {},
}

const bad = (error) => ({ status: 422, error })

/** Valida el body del PUT. Devuelve { value: {settings, deliveryFee} } o { status, error }. */
export function parseSettingsBody(b = {}) {
  const s = {}
  if (typeof b.enabled !== 'boolean') return bad('enabled debe ser verdadero o falso')
  s.enabled = b.enabled

  const slug = b.public_slug ? String(b.public_slug).trim().toLowerCase() : null
  if (slug && !SLUG_RE.test(slug)) return bad('El enlace público debe tener 3-64 caracteres: letras minúsculas, números y guiones')
  if (s.enabled && !slug) return bad('Para activar los pedidos define el enlace público')
  s.public_slug = slug

  const methods = Array.isArray(b.payment_methods) ? [...new Set(b.payment_methods)] : []
  if (!methods.length || methods.some(m => !PAYMENT_METHODS.includes(m))) return bad('Elige al menos un método de pago válido')
  s.payment_methods = methods

  if (!ACCEPT_POLICIES.includes(b.accept_policy)) return bad('Política de aceptación inválida')
  s.accept_policy = b.accept_policy

  const ttl = Number(b.quote_ttl_minutes)
  if (!Number.isInteger(ttl) || ttl < 5 || ttl > 60) return bad('La vigencia de la cotización debe ser de 5 a 60 minutos')
  s.quote_ttl_minutes = ttl

  const h = b.business_hours || {}
  if (h.open || h.close || h.days?.length) {
    if (!TIME_RE.test(h.open || '') || !TIME_RE.test(h.close || '')) return bad('Horario inválido (usa HH:MM)')
    if (h.open >= h.close) return bad('La hora de apertura debe ser anterior al cierre')
    if (!Array.isArray(h.days) || !h.days.length || h.days.some(d => !DAYS.includes(d))) return bad('Elige los días de atención')
    s.business_hours = { open: h.open, close: h.close, days: [...new Set(h.days)] }
  } else s.business_hours = {}

  const instructions = String(b.transfer_details?.instructions ?? '').trim().slice(0, 500)
  if (s.payment_methods.includes('transfer') && !instructions) return bad('Escribe las instrucciones para pagar por transferencia')
  s.transfer_details = instructions ? { instructions } : {}

  let deliveryFee = null
  if (b.delivery_fee !== undefined && b.delivery_fee !== null && b.delivery_fee !== '') {
    deliveryFee = Number(b.delivery_fee)
    if (!Number.isFinite(deliveryFee) || deliveryFee < 0 || deliveryFee > 1_000_000) return bad('Tarifa de domicilio inválida')
  }
  return { value: { settings: s, deliveryFee } }
}

const activeZones = async (tenantId, locationId) => {
  const { data, error } = await supabaseAdmin.from('delivery_zones').select('id, name, fee')
    .eq('tenant_id', tenantId).eq('location_id', locationId).eq('active', true)
  if (error) throw error
  return data || []
}

async function view(tenantId, locationId) {
  const [{ data: row }, { data: loc }, zones] = await Promise.all([
    supabaseAdmin.from('order_settings').select('*').eq('tenant_id', tenantId).eq('location_id', locationId).maybeSingle(),
    supabaseAdmin.from('locations').select('name').eq('id', locationId).eq('tenant_id', tenantId).maybeSingle(),
    activeZones(tenantId, locationId),
  ])
  const { id: _id, tenant_id: _t, created_at: _c, updated_at: _u, ...settings } = row || {}
  return {
    ...DEFAULTS, ...settings,
    location_id: locationId, location_name: loc?.name ?? null, configured: !!row,
    zones_count: zones.length,
    delivery_fee: zones.length === 1 ? Number(zones[0].fee) : null, // con varias zonas la tarifa se gestiona aparte
  }
}

// GET /orders/settings?location_id=
export async function ordersSettingsGet(req, res) {
  const auth = await requireCan(req, res, 'manage_connect'); if (!auth) return
  const locationId = scopedLocation(auth, req.query?.location_id, res)
  if (!locationId) return
  return res.json(await view(auth.tenantId, locationId))
}

// PUT /orders/settings?location_id=
export async function ordersSettingsPut(req, res) {
  const auth = await requireCan(req, res, 'manage_connect'); if (!auth) return
  const locationId = scopedLocation(auth, req.query?.location_id, res)
  if (!locationId) return
  const parsed = parseSettingsBody(req.body)
  if (parsed.error) return res.status(parsed.status).json({ error: parsed.error })
  const { settings, deliveryFee } = parsed.value

  const zones = await activeZones(auth.tenantId, locationId)
  if (deliveryFee !== null && zones.length > 1) {
    return res.status(409).json({ error: 'Hay varias zonas de entrega activas: la tarifa no se edita desde aquí' })
  }

  const now = new Date().toISOString()
  const { data: existing } = await supabaseAdmin.from('order_settings').select('id')
    .eq('tenant_id', auth.tenantId).eq('location_id', locationId).maybeSingle()
  const write = existing
    ? supabaseAdmin.from('order_settings').update({ ...settings, updated_at: now }).eq('id', existing.id).eq('tenant_id', auth.tenantId)
    : supabaseAdmin.from('order_settings').insert({ ...settings, tenant_id: auth.tenantId, location_id: locationId })
  const { error } = await write
  if (error?.code === UNIQUE_VIOLATION) return res.status(409).json({ error: 'Ese enlace público ya está en uso' })
  if (error) throw error

  if (deliveryFee !== null) {
    const w = zones.length
      ? supabaseAdmin.from('delivery_zones').update({ fee: deliveryFee, updated_at: now }).eq('id', zones[0].id).eq('tenant_id', auth.tenantId)
      : supabaseAdmin.from('delivery_zones').insert({ tenant_id: auth.tenantId, location_id: locationId, name: 'Domicilio', fee: deliveryFee })
    const { error: zErr } = await w
    if (zErr) throw zErr
  }
  return res.json(await view(auth.tenantId, locationId))
}
