import { supabaseAdmin } from '../supabaseAdmin.js'
import { PermanentError } from '../services/outboxService.js'
import { getAdapter } from '../adapters/whatsappAdapter.js'
import { windowOpen, preview } from '../services/conversationService.js'
import { ORDER_EVENTS } from './orderEvents.js'

// =====================================================
// Handlers del outbox que envían por WhatsApp.
//   message.outbound  → respuesta humana desde la bandeja (el mensaje ya existe como 'queued')
//   order.* / payment.* → aviso de cambio de estado al cliente
//
// Entrega al-menos-una-vez: si el proceso cae justo después de enviar y antes de guardar
// el resultado, el reintento reenvía (límite conocido; Meta no ofrece idempotencia de envío).
// Fuera de la ventana de 24 h de Meta solo se admiten plantillas aprobadas, que aún no
// existen: esos envíos fallan de forma permanente y visible, no se reintentan.
// =====================================================

const UNIQUE_VIOLATION = '23505'
const money = (n) => `$${new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(Number(n) || 0)}`
const code = (order) => String(order.id).slice(0, 8).toUpperCase()

/** El valor de `access_token_secret_ref` es el NOMBRE de una variable de entorno, nunca el token. */
export const resolveSecret = (ref) => (ref ? process.env[ref] || null : null)

const TEXTS = {
  [ORDER_EVENTS.submitted]:       (o) => `Recibimos tu pedido #${code(o)} por ${money(o.total)}. Te avisaremos cuando lo revisemos.`,
  [ORDER_EVENTS.accepted]:        (o) => `Tu pedido #${code(o)} fue aceptado. Total: ${money(o.total)}.`,
  [ORDER_EVENTS.rejected]:        (o) => `No pudimos aceptar tu pedido #${code(o)}.${o.reject_reason ? ` Motivo: ${o.reject_reason}` : ''}`,
  [ORDER_EVENTS.paymentVerified]: (o) => `Verificamos tu transferencia del pedido #${code(o)}. ¡Gracias!`,
  [ORDER_EVENTS.paymentRejected]: (o) => `No pudimos verificar tu transferencia del pedido #${code(o)}. Escríbenos para revisarla.`,
}

const DELIVERY_TEXTS = {
  picked_up:       (o) => `Tu pedido #${code(o)} ya va en camino.`,
  delivered:       (o) => `Tu pedido #${code(o)} fue entregado. ¡Gracias por tu compra!`,
  delivery_failed: (o) => `No pudimos entregar tu pedido #${code(o)}. Te contactaremos para coordinar una nueva entrega.`,
}

const one = async (table, tenantId, filters) => {
  let q = supabaseAdmin.from(table).select('*').eq('tenant_id', tenantId)
  for (const [col, val] of Object.entries(filters)) q = q.eq(col, val)
  const { data } = await q.maybeSingle()
  return data || null
}

/**
 * Envía un mensaje saliente ya registrado en `messages` (status 'queued').
 * Idempotente: si ya salió, no hace nada. Un fallo permanente o el último intento
 * dejan el mensaje en 'failed' para que el operador lo vea en la bandeja.
 */
export async function deliverMessage(row, messageId, { fetchImpl, now = new Date() } = {}) {
  const tenantId = row.tenant_id
  const msg = await one('messages', tenantId, { id: messageId })
  if (!msg) throw new PermanentError('Mensaje inexistente')
  if (msg.status !== 'queued') return

  const fail = async (err) => {
    if (err.permanent || row.attempts >= row.max_attempts) {
      const { error } = await supabaseAdmin.from('messages').update({ status: 'failed' }).eq('id', msg.id).eq('tenant_id', tenantId)
      if (error) throw error
    }
    throw err
  }

  const conversation = await one('conversations', tenantId, { id: msg.conversation_id })
  const channel = conversation && await one('whatsapp_channels', tenantId, { id: conversation.channel_id })
  if (!channel || channel.status !== 'active') return fail(new PermanentError('El canal de WhatsApp está desconectado'))
  if (!windowOpen(conversation, now)) return fail(new PermanentError('Fuera de la ventana de 24 h: WhatsApp exige una plantilla aprobada'))
  const adapter = getAdapter(channel.provider)
  if (!adapter) return fail(new PermanentError(`Proveedor no soportado: ${channel.provider}`))

  let remoteId
  try {
    remoteId = await adapter.sendTextMessage({
      to: conversation.remote_chat_id, text: msg.body, fetchImpl,
      channelConfig: { phoneNumberId: channel.phone_number_id, accessToken: resolveSecret(channel.access_token_secret_ref) },
    })
  } catch (err) { return fail(err) }

  const sentAt = now.toISOString()
  const { error } = await supabaseAdmin.from('messages').update({ remote_message_id: remoteId, status: 'sent' })
    .eq('id', msg.id).eq('tenant_id', tenantId).eq('status', 'queued')
  if (error) throw error
  await supabaseAdmin.from('conversations').update({ last_message_at: sentAt, last_message_preview: preview(msg.body), updated_at: sentAt })
    .eq('id', conversation.id).eq('tenant_id', tenantId)
}

/** message.outbound: respuesta humana. payload: { message_id }. */
export const sendOutboundMessage = (row, deps) => deliverMessage(row, row.payload?.message_id, deps)

/** Aviso al cliente por un cambio de estado de su pedido, dentro de la conversación que ya tiene con el negocio. */
export const orderNotification = (eventType) => (row, deps) => notifyCustomer(row, deps, TEXTS[eventType])

/** order.delivery_status_changed: payload { delivery_id, status }. */
export const deliveryNotification = (row, deps) => {
  const text = DELIVERY_TEXTS[row.payload?.status]
  if (!text) throw new PermanentError('Estado de entrega sin aviso')
  return notifyCustomer(row, deps, text)
}

async function notifyCustomer(row, deps = {}, textFor) {
  const tenantId = row.tenant_id
  const order = await one('order_requests', tenantId, { id: row.aggregate_id })
  if (!order) throw new PermanentError('Pedido inexistente')
  const customer = await one('order_customers', tenantId, { id: order.customer_id })
  if (!customer?.phone) throw new PermanentError('El cliente no tiene teléfono')

  const { data: channels } = await supabaseAdmin.from('whatsapp_channels').select('*')
    .eq('tenant_id', tenantId).eq('location_id', order.location_id).eq('status', 'active')
  const channel = channels?.[0]
  if (!channel) throw new PermanentError('La sede no tiene un canal de WhatsApp activo')

  const conversation = await one('conversations', tenantId, { channel_id: channel.id, remote_chat_id: customer.phone.replace('+', '') })
  if (!conversation || !windowOpen(conversation, deps.now)) {
    throw new PermanentError('El cliente no ha escrito en las últimas 24 h: se requiere una plantilla aprobada')
  }

  // Un mensaje por fila del outbox: un reintento reutiliza el registro en vez de crear otro
  const key = `outbox:${row.id}`
  const ins = await supabaseAdmin.from('messages').insert({
    tenant_id: tenantId, conversation_id: conversation.id, direction: 'outbound', type: 'text',
    body: textFor(order), status: 'queued', idempotency_key: key,
  }).select('id').maybeSingle()
  if (ins.error && ins.error.code !== UNIQUE_VIOLATION) throw ins.error
  const message = ins.data || await one('messages', tenantId, { idempotency_key: key })
  await deliverMessage(row, message.id, deps)
}
