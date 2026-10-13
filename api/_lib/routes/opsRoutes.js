import { supabaseAdmin } from '../supabaseAdmin.js'
import { requireCan } from '../auth.js'
import { scopedLocation } from '../scopedLocation.js'
import { locationInScope } from '../scope.js'
import { computeMetrics } from '../opsMetrics.js'

// =====================================================
// Vendra Pedidos — operación y soporte del piloto (permiso manage_connect).
//   GET  /orders/ops                 métricas de los últimos 7 días + salud del outbox + eventos agotados
//   POST /orders/ops/outbox/:id/retry  reintenta una notificación que agotó sus intentos
// Toda consulta lleva tenant_id; el administrador de punto solo ve lo de sus sedes.
// =====================================================

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const WINDOW_DAYS = 7
const LIMIT = 1000
const FAILED_LIST = 20
const ACTIVE_ORDERS = ['submitted', 'under_review', 'accepted']
const FAILED_COLS = 'id, event_type, aggregate_type, attempts, max_attempts, error_details, payload, created_at, updated_at'

/** ¿El usuario puede ver esta fila del outbox? Sin sede en el payload solo la ve el superadministrador. */
const visible = (auth, row) => {
  const loc = row.payload?.location_id
  return loc ? locationInScope(auth.scope, loc) : auth.scope.all
}

// GET /orders/ops?location_id=
export async function opsStatus(req, res) {
  const auth = await requireCan(req, res, 'manage_connect'); if (!auth) return
  const locationId = scopedLocation(auth, req.query?.location_id, res, { allowAll: true })
  if (locationId === undefined) return
  const t = auth.tenantId
  const now = new Date()
  const since = new Date(now.getTime() - WINDOW_DAYS * 86_400_000).toISOString()
  const scoped = (q) => (locationId ? q.eq('location_id', locationId) : auth.scope.all ? q : q.in('location_id', auth.scope.locationIds))

  const [orders, activeOrders, payments, deliveries, convs, outbox, integ, msgs] = await Promise.all([
    scoped(supabaseAdmin.from('order_requests').select('status, created_at, history').eq('tenant_id', t).gte('created_at', since)).limit(LIMIT),
    scoped(supabaseAdmin.from('order_requests').select('id, status').eq('tenant_id', t).in('status', ACTIVE_ORDERS)).limit(LIMIT),
    supabaseAdmin.from('payment_records').select('order_request_id').eq('tenant_id', t).eq('method', 'transfer').in('status', ['pending', 'proof_submitted']).limit(LIMIT),
    scoped(supabaseAdmin.from('deliveries').select('status, assigned_at, delivered_at').eq('tenant_id', t).gte('created_at', since)).limit(LIMIT),
    scoped(supabaseAdmin.from('conversations').select('id').eq('tenant_id', t).eq('status', 'open')).limit(LIMIT),
    supabaseAdmin.from('connect_outbox').select(FAILED_COLS + ', status').eq('tenant_id', t).in('status', ['pending', 'processing', 'failed']).limit(LIMIT),
    supabaseAdmin.from('integration_events').select('id').eq('tenant_id', t).eq('status', 'failed').gte('created_at', since).limit(LIMIT),
    supabaseAdmin.from('messages').select('id').eq('tenant_id', t).eq('direction', 'outbound').eq('status', 'failed').gte('created_at', since).limit(LIMIT),
  ])
  for (const r of [orders, activeOrders, payments, deliveries, convs, outbox, integ, msgs]) if (r.error) throw r.error

  const outboxRows = (outbox.data || []).filter(r => visible(auth, r))
  const { metrics, health } = computeMetrics({
    orders: orders.data || [], activeOrders: activeOrders.data || [], pendingPayments: payments.data || [],
    deliveries: deliveries.data || [], conversationsOpen: (convs.data || []).length, outbox: outboxRows,
    integrationFailed: (integ.data || []).length, messagesFailed: (msgs.data || []).length, now,
  })
  const failed = outboxRows.filter(r => r.status === 'failed')
    .sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at))).slice(0, FAILED_LIST)
    .map(({ id, event_type, aggregate_type, attempts, max_attempts, error_details, updated_at }) => ({ id, event_type, aggregate_type, attempts, max_attempts, error_details, updated_at }))
  return res.json({ since, metrics, health, failed })
}

// POST /orders/ops/outbox/:id/retry
export async function opsRetryOutbox(req, res, id) {
  const auth = await requireCan(req, res, 'manage_connect'); if (!auth) return
  if (!UUID_RE.test(String(id))) return res.status(404).json({ error: 'Evento no encontrado' })
  const t = auth.tenantId
  const { data: row } = await supabaseAdmin.from('connect_outbox').select('id, status, event_type, payload')
    .eq('id', id).eq('tenant_id', t).maybeSingle()
  if (!row) return res.status(404).json({ error: 'Evento no encontrado' })
  if (!visible(auth, row)) return res.status(403).json({ error: 'No tienes acceso a este evento' })
  if (row.status !== 'failed') return res.status(409).json({ error: 'Solo se reintentan los eventos fallidos' })

  // El mensaje saliente quedó 'failed' junto con la fila: se devuelve a la cola o el handler no enviaría nada
  const messageFilter = row.payload?.message_id ? ['id', row.payload.message_id] : ['idempotency_key', `outbox:${row.id}`]
  const { error: mErr } = await supabaseAdmin.from('messages').update({ status: 'queued' })
    .eq('tenant_id', t).eq(messageFilter[0], messageFilter[1]).eq('status', 'failed')
  if (mErr) throw mErr

  const now = new Date().toISOString()
  const { data, error } = await supabaseAdmin.from('connect_outbox')
    .update({ status: 'pending', attempts: 0, next_attempt_at: now, error_details: null, updated_at: now })
    .eq('id', row.id).eq('tenant_id', t).eq('status', 'failed') // guarda contra otro reintento simultáneo
    .select('id').maybeSingle()
  if (error) throw error
  if (!data) return res.status(409).json({ error: 'El evento cambió. Recarga e intenta de nuevo' })
  return res.json({ id: data.id, status: 'pending' })
}
