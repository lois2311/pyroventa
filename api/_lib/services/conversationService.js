import { supabaseAdmin } from '../supabaseAdmin.js'

// =====================================================
// Vendra Pedidos — conversaciones y mensajes de WhatsApp.
// Una conversación NO es un pedido. Toda consulta lleva tenant_id (el tenant sale
// del canal resuelto o del token del operador, nunca del cuerpo).
// =====================================================

const UNIQUE_VIOLATION = '23505'
/** Ventana de atención de Meta: solo se puede escribir libremente hasta 24 h después del último mensaje del cliente. */
export const WINDOW_MS = 24 * 60 * 60 * 1000
const PREVIEW_LEN = 80

export const preview = (text) => String(text ?? '').replace(/\s+/g, ' ').trim().slice(0, PREVIEW_LEN)

/** wa_id de Meta (solo dígitos, con indicativo) → E.164, o null. */
export const waIdToE164 = (waId) => (/^[1-9]\d{7,14}$/.test(String(waId)) ? `+${waId}` : null)

/** ¿Se puede enviar texto libre ahora mismo? */
export const windowOpen = (conversation, now = new Date()) =>
  !!conversation?.last_inbound_at && now.getTime() - new Date(conversation.last_inbound_at).getTime() < WINDOW_MS

const RANK = { received: 0, queued: 0, sent: 1, delivered: 2, read: 3 }
/** Los estados de entrega llegan desordenados: solo se avanza (read no vuelve a delivered). failed solo antes de leerse. */
export function nextStatus(current, incoming) {
  if (incoming === 'failed') return ['read'].includes(current) ? current : 'failed'
  if (current === 'failed') return incoming // un envío marcado fallido que Meta luego confirma
  return (RANK[incoming] ?? -1) > (RANK[current] ?? -1) ? incoming : current
}

/** Canal activo/inactivo por el id del número de Meta (null si no existe). */
export async function findChannelByPhoneNumberId(provider, phoneNumberId) {
  const { data } = await supabaseAdmin.from('whatsapp_channels').select('*')
    .eq('provider', provider).eq('phone_number_id', phoneNumberId).maybeSingle()
  return data || null
}

/** Canal para el handshake GET del webhook (por token de verificación). */
export async function findChannelByVerifyToken(provider, token) {
  if (!token) return null
  const { data } = await supabaseAdmin.from('whatsapp_channels').select('id')
    .eq('provider', provider).eq('webhook_verify_token', token).maybeSingle()
  return data || null
}

async function upsertCustomerByPhone(tenantId, phone, name) {
  const find = () => supabaseAdmin.from('customers').select('id, name').eq('tenant_id', tenantId).eq('phone', phone).maybeSingle()
  let { data: customer } = await find()
  if (customer) return customer
  const ins = await supabaseAdmin.from('customers').insert({ tenant_id: tenantId, phone, name }).select('id, name').maybeSingle()
  if (ins.error && ins.error.code !== UNIQUE_VIOLATION) throw ins.error
  return ins.data || (await find()).data
}

/** Hilo del cliente en el canal; lo crea si no existe (resiste la carrera de dos mensajes simultáneos). */
export async function getOrCreateConversation(channel, waId, customerId) {
  const find = () => supabaseAdmin.from('conversations').select('*')
    .eq('tenant_id', channel.tenant_id).eq('channel_id', channel.id).eq('remote_chat_id', waId).maybeSingle()
  const { data: existing } = await find()
  if (existing) return existing
  const ins = await supabaseAdmin.from('conversations').insert({
    tenant_id: channel.tenant_id, location_id: channel.location_id, channel_id: channel.id,
    customer_id: customerId, remote_chat_id: waId, status: 'open',
  }).select('*').maybeSingle()
  if (ins.error && ins.error.code !== UNIQUE_VIOLATION) throw ins.error
  return ins.data || (await find()).data
}

/**
 * Registra un mensaje entrante normalizado: cliente → conversación → mensaje.
 * Idempotente por (tenant, remote_message_id): un wamid repetido no duplica nada.
 * Una conversación cerrada se reabre; el mensaje abre la ventana de 24 h.
 * @returns { duplicate: boolean, conversation }
 */
export async function recordInboundMessage(channel, m) {
  const phone = waIdToE164(m.from)
  const customer = phone ? await upsertCustomerByPhone(channel.tenant_id, phone, m.name) : null
  const conversation = await getOrCreateConversation(channel, m.from, customer?.id ?? null)

  const ins = await supabaseAdmin.from('messages').insert({
    tenant_id: channel.tenant_id, conversation_id: conversation.id, direction: 'inbound', type: m.type, body: m.body,
    remote_message_id: m.id, status: 'received', raw_payload: m.raw ?? null, created_at: m.timestamp,
  }).select('id').maybeSingle()
  if (ins.error?.code === UNIQUE_VIOLATION) return { duplicate: true, conversation }
  if (ins.error) throw ins.error

  const { error } = await supabaseAdmin.from('conversations').update({
    status: 'open', last_message_at: m.timestamp, last_inbound_at: m.timestamp, last_message_preview: preview(m.body),
    ...(conversation.customer_id || !customer ? {} : { customer_id: customer.id }), updated_at: new Date().toISOString(),
  }).eq('id', conversation.id).eq('tenant_id', channel.tenant_id)
  if (error) throw error
  return { duplicate: false, conversation }
}

/**
 * Aplica un estado de entrega (sent/delivered/read/failed) a un mensaje saliente.
 * @returns 'updated' | 'unknown_message' (p. ej. enviado desde el teléfono, no desde Vendra)
 */
export async function applyDeliveryStatus(channel, s) {
  const { data: msg } = await supabaseAdmin.from('messages').select('id, status')
    .eq('tenant_id', channel.tenant_id).eq('remote_message_id', s.id).maybeSingle()
  if (!msg) return 'unknown_message'
  const status = nextStatus(msg.status, s.status)
  if (status !== msg.status) {
    const { error } = await supabaseAdmin.from('messages').update({ status }).eq('id', msg.id).eq('tenant_id', channel.tenant_id)
    if (error) throw error
  }
  return 'updated'
}
