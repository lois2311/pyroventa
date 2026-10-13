import { supabaseAdmin } from '../supabaseAdmin.js'
import { requireCan } from '../auth.js'
import { scopedLocation, denyOutOfScope } from '../scopedLocation.js'
import { enqueue } from '../services/outboxService.js'
import { windowOpen, preview } from '../services/conversationService.js'
import { idemKey } from './orderRequestRoutes.js'

// =====================================================
// Vendra Pedidos — bandeja de conversaciones (permiso manage_conversations, alcance por sede).
// Una conversación no es un pedido. Toda consulta lleva tenant_id.
// =====================================================

const UNIQUE_VIOLATION = '23505'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const CONVERSATION_STATUSES = ['open', 'closed', 'archived']
const PAGE_SIZE = 50
const MAX_TEXT = 1000

async function loadConversation(auth, id, res) {
  if (!UUID_RE.test(String(id))) { res.status(404).json({ error: 'Conversación no encontrada' }); return null }
  const { data } = await supabaseAdmin.from('conversations').select('*')
    .eq('id', id).eq('tenant_id', auth.tenantId).maybeSingle()
  if (!data) { res.status(404).json({ error: 'Conversación no encontrada' }); return null }
  if (denyOutOfScope(auth, data.location_id, res)) return null
  return data
}

const withWindow = (c, now = new Date()) => ({ ...c, window_open: windowOpen(c, now) })

// GET /orders/conversations?location_id=&status=
export async function conversationsList(req, res) {
  const auth = await requireCan(req, res, 'manage_conversations'); if (!auth) return
  const locationId = scopedLocation(auth, req.query?.location_id, res, { allowAll: true })
  if (locationId === undefined) return
  const status = req.query?.status || 'open'
  if (!CONVERSATION_STATUSES.includes(status)) return res.status(422).json({ error: 'status inválido' })

  let q = supabaseAdmin.from('conversations')
    .select('id, location_id, customer_id, remote_chat_id, status, last_message_at, last_inbound_at, last_message_preview')
    .eq('tenant_id', auth.tenantId).eq('status', status)
  if (locationId) q = q.eq('location_id', locationId)
  const { data, error } = await q.order('last_message_at', { ascending: false }).limit(100)
  if (error) throw error

  const rows = data || []
  const ids = [...new Set(rows.map(c => c.customer_id).filter(Boolean))]
  const { data: customers } = ids.length
    ? await supabaseAdmin.from('order_customers').select('id, name, phone').eq('tenant_id', auth.tenantId).in('id', ids)
    : { data: [] }
  const byId = new Map((customers || []).map(c => [c.id, c]))
  const now = new Date()
  return res.json(rows.map(({ customer_id, remote_chat_id, ...c }) => ({
    ...withWindow(c, now),
    customer: byId.get(customer_id) ? { name: byId.get(customer_id).name, phone: byId.get(customer_id).phone } : { name: null, phone: `+${remote_chat_id}` },
  })))
}

// GET /orders/conversations/:id/messages?before=<ISO>&limit=
export async function conversationMessages(req, res, id) {
  const auth = await requireCan(req, res, 'manage_conversations'); if (!auth) return
  const conversation = await loadConversation(auth, id, res); if (!conversation) return
  const limit = Math.min(Math.max(parseInt(req.query?.limit, 10) || PAGE_SIZE, 1), 100)
  const before = req.query?.before
  if (before && Number.isNaN(Date.parse(before))) return res.status(422).json({ error: 'before inválido' })

  let q = supabaseAdmin.from('messages')
    .select('id, direction, type, body, status, sent_by, created_at')
    .eq('tenant_id', auth.tenantId).eq('conversation_id', conversation.id)
  if (before) q = q.lt('created_at', before)
  const { data, error } = await q.order('created_at', { ascending: false }).limit(limit + 1)
  if (error) throw error

  const page = (data || []).slice(0, limit)
  return res.json({
    conversation: withWindow({ id: conversation.id, status: conversation.status, last_inbound_at: conversation.last_inbound_at }),
    messages: page.reverse(), // cronológico ascendente para mostrar
    next_before: (data || []).length > limit ? page[0]?.created_at ?? null : null,
  })
}

// POST /orders/conversations/:id/messages  { text }  — respuesta humana; sale por el outbox
export async function messageSend(req, res, id) {
  const auth = await requireCan(req, res, 'manage_conversations'); if (!auth) return
  const key = idemKey(req, res); if (!key) return
  const conversation = await loadConversation(auth, id, res); if (!conversation) return

  const text = typeof req.body?.text === 'string' ? req.body.text.trim() : ''
  if (!text) return res.status(422).json({ error: 'Escribe el mensaje' })
  if (text.length > MAX_TEXT) return res.status(422).json({ error: `Máximo ${MAX_TEXT} caracteres` })

  const find = () => supabaseAdmin.from('messages').select('id, direction, type, body, status, sent_by, created_at')
    .eq('tenant_id', auth.tenantId).eq('conversation_id', conversation.id).eq('idempotency_key', key).maybeSingle()

  let { data: message } = await find()
  let created = false
  if (!message) {
    // Solo se valida la ventana al crear: un reintento de un envío ya aceptado no debe fallar por pasar el tiempo
    if (!windowOpen(conversation)) {
      return res.status(409).json({ error: 'Pasaron más de 24 h desde el último mensaje del cliente. WhatsApp solo permite plantillas aprobadas.' })
    }
    const ins = await supabaseAdmin.from('messages').insert({
      tenant_id: auth.tenantId, conversation_id: conversation.id, direction: 'outbound', type: 'text',
      body: text, status: 'queued', sent_by: auth.seller.id, idempotency_key: key,
    }).select('id, direction, type, body, status, sent_by, created_at').maybeSingle()
    if (ins.error && ins.error.code !== UNIQUE_VIOLATION) throw ins.error
    message = ins.data || (await find()).data
    created = !ins.error
  }

  // Idempotente por dedupe_key: un reintento repara un encolado que falló la vez anterior
  await enqueue({
    tenantId: auth.tenantId, eventType: 'message.outbound', aggregateType: 'conversation', aggregateId: conversation.id,
    payload: { message_id: message.id, conversation_id: conversation.id, location_id: conversation.location_id }, dedupeKey: `message.outbound:${message.id}`,
  })
  if (created) {
    await supabaseAdmin.from('conversations')
      .update({ last_message_at: message.created_at, last_message_preview: preview(text), updated_at: new Date().toISOString() })
      .eq('id', conversation.id).eq('tenant_id', auth.tenantId)
  }
  return res.status(created ? 201 : 200).json(message)
}
