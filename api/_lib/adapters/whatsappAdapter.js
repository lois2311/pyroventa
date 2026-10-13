import { createHmac, timingSafeEqual } from 'node:crypto'
import { PermanentError } from '../services/outboxService.js'

// =====================================================
// Adaptador de WhatsApp — Meta Cloud API.
// Aísla al proveedor del dominio comercial: el resto del código solo conoce
// mensajes y estados normalizados. Otro proveedor (Twilio) sería otro objeto
// con la misma forma registrado en `ADAPTERS`.
// Nunca se loguean ni se incluyen en errores tokens ni teléfonos.
// =====================================================

const GRAPH_URL = 'https://graph.facebook.com/v21.0'
const SEND_TIMEOUT_MS = 10_000

/** HMAC-SHA256 del cuerpo EXACTO recibido, comparado en tiempo constante (X-Hub-Signature-256). */
export function verifySignature(rawBody, header, appSecret) {
  if (typeof rawBody !== 'string' || !appSecret || typeof header !== 'string' || !header.startsWith('sha256=')) return false
  const expected = createHmac('sha256', appSecret).update(rawBody).digest()
  const given = Buffer.from(header.slice('sha256='.length), 'hex')
  return given.length === expected.length && timingSafeEqual(given, expected)
}

const STATUS_MAP = { sent: 'sent', delivered: 'delivered', read: 'read', failed: 'failed' }
const iso = (ts) => new Date(Number(ts) * 1000).toISOString()

/** Cuerpo del mensaje y tipo normalizado (text | interactive | image). Lo no soportado se anota como texto. */
function normalizeContent(m) {
  switch (m.type) {
    case 'text': return { type: 'text', body: m.text?.body ?? '' }
    case 'image': return { type: 'image', body: m.image?.caption ?? '', mediaId: m.image?.id ?? null }
    case 'interactive': return { type: 'interactive', body: m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title ?? '' }
    case 'button': return { type: 'interactive', body: m.button?.text ?? '' }
    default: return { type: 'text', body: `[mensaje no soportado: ${m.type}]` }
  }
}

/**
 * Payload del webhook → { messages, statuses } normalizados.
 * `raw` conserva el objeto original del proveedor (para auditoría).
 */
export function parseWebhook(payload) {
  const out = { messages: [], statuses: [] }
  for (const entry of payload?.entry || []) {
    for (const change of entry.changes || []) {
      if (change.field !== 'messages') continue
      const v = change.value || {}
      const phoneNumberId = v.metadata?.phone_number_id
      if (!phoneNumberId) continue
      const names = new Map((v.contacts || []).map(c => [c.wa_id, c.profile?.name]))
      for (const m of v.messages || []) {
        if (!m.id || !m.from) continue
        out.messages.push({ phoneNumberId, id: m.id, from: m.from, name: names.get(m.from) || null, timestamp: iso(m.timestamp), ...normalizeContent(m), raw: m })
      }
      for (const s of v.statuses || []) {
        const status = STATUS_MAP[s.status]
        if (!s.id || !status) continue
        out.statuses.push({ phoneNumberId, id: s.id, status, recipient: s.recipient_id, timestamp: iso(s.timestamp), raw: s })
      }
    }
  }
  return out
}

/**
 * Envía un texto. Devuelve el id del mensaje en Meta.
 * 429, 5xx y errores de red → Error (el outbox reintenta).
 * Otros 4xx (token inválido, número inexistente, fuera de ventana) → PermanentError.
 * @param channelConfig { phoneNumberId, accessToken }
 */
export async function sendTextMessage({ to, text, channelConfig, fetchImpl = fetch }) {
  const { phoneNumberId, accessToken } = channelConfig || {}
  if (!phoneNumberId || !accessToken) throw new Error('Canal sin credenciales configuradas')
  let res
  try {
    res = await fetchImpl(`${GRAPH_URL}/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body: text, preview_url: false } }),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    })
  } catch {
    throw new Error('No se pudo contactar a WhatsApp (red o tiempo de espera)')
  }
  const data = await res.json().catch(() => ({}))
  if (res.ok) {
    const id = data.messages?.[0]?.id
    if (!id) throw new Error('Respuesta de WhatsApp sin id de mensaje')
    return id
  }
  const detail = `WhatsApp ${res.status}${data.error?.code ? ` (#${data.error.code})` : ''}: ${String(data.error?.message || 'error').slice(0, 200)}`
  if (res.status === 429 || res.status >= 500) throw new Error(detail)
  throw new PermanentError(detail)
}

const metaAdapter = { verifySignature, parseWebhook, sendTextMessage }
const ADAPTERS = { meta: metaAdapter }

/** Adaptador del proveedor, o null si no está soportado. */
export const getAdapter = (provider) => ADAPTERS[provider] || null
