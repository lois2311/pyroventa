import { getAdapter } from '../adapters/whatsappAdapter.js'
import { recordInboundEvent, finishInboundEvent } from '../events/inbox.js'
import { findChannelByPhoneNumberId, findChannelByVerifyToken, recordInboundMessage, applyDeliveryStatus } from '../services/conversationService.js'
import { clientIp } from '../loginLock.js'
import { hit } from '../rateLimit.js'

// =====================================================
// Vendra Pedidos — webhook de WhatsApp (sin JWT: la autenticidad la da la firma HMAC).
// Lo sirve api/whatsapp-webhook.js, una función aparte porque la
// firma se calcula sobre el cuerpo EXACTO y el despachador general ya lo parsea como JSON.
//
// Flujo POST: validar firma → persistir cada evento (deduplicado) → resolver canal/tenant →
// registrar mensaje/estado → 200. Un fallo de procesamiento responde 500 para que el proveedor
// reintente; el reintento reprocesa solo los eventos que no quedaron 'processed'/'ignored'.
// Nunca se loguean teléfonos, tokens ni cuerpos.
// =====================================================

const FINAL = ['processed', 'ignored']
const BAD_SIG_RECORDS_PER_MIN = 20

// GET /integrations/whatsapp/:provider/webhook — handshake de suscripción de Meta
export async function whatsappWebhookVerify(req, res, provider) {
  if (!getAdapter(provider)) return res.status(404).json({ error: 'Proveedor no soportado' })
  const q = req.query || {}
  const channel = q['hub.mode'] === 'subscribe' ? await findChannelByVerifyToken(provider, q['hub.verify_token']) : null
  if (!channel || !q['hub.challenge']) return res.status(403).json({ error: 'Verificación rechazada' })
  res.setHeader('Content-Type', 'text/plain')
  return res.status(200).send(String(q['hub.challenge']))
}

/** Procesa un mensaje o estado ya normalizado. Devuelve 1 si falló, 0 si quedó resuelto. */
async function processUnit(provider, kind, unit) {
  const remoteEventId = kind === 'message' ? unit.id : `${unit.id}:${unit.status}` // un mismo wamid trae varios estados
  const channel = await findChannelByPhoneNumberId(provider, unit.phoneNumberId)
  const { duplicate, event } = await recordInboundEvent({
    provider, remoteEventId, tenantId: channel?.tenant_id ?? null, payload: unit.raw,
  })
  if (duplicate && FINAL.includes(event.status)) return 0

  try {
    if (!channel) await finishInboundEvent(event, 'ignored', 'unknown_channel')
    else if (channel.status !== 'active') await finishInboundEvent(event, 'ignored', 'channel_disconnected') // un canal desconectado no origina nada
    else {
      const result = kind === 'message'
        ? (await recordInboundMessage(channel, unit), 'processed')
        : await applyDeliveryStatus(channel, unit)
      if (result === 'unknown_message') await finishInboundEvent(event, 'ignored', 'unknown_message')
      else await finishInboundEvent(event, 'processed')
    }
    return 0
  } catch (err) {
    await finishInboundEvent(event, 'failed', err).catch(() => {})
    return 1
  }
}

// POST /integrations/whatsapp/:provider/webhook — req.rawBody: cuerpo exacto como string
export async function whatsappWebhookPost(req, res, provider) {
  const adapter = getAdapter(provider)
  if (!adapter) return res.status(404).json({ error: 'Proveedor no soportado' })
  const raw = req.rawBody
  if (typeof raw !== 'string') {
    console.error(JSON.stringify({ event: 'whatsapp.webhook', error: 'raw_body_missing' }))
    return res.status(500).json({ error: 'Webhook mal enrutado' })
  }
  const secret = process.env.META_APP_SECRET
  if (!secret) return res.status(503).json({ error: 'Webhook no configurado' })

  if (!adapter.verifySignature(raw, req.headers?.['x-hub-signature-256'], secret)) {
    // Se deja constancia (solo el hash: el cuerpo no es de confianza), acotada para que no sea un vector de relleno
    if (hit(`wa-bad-sig:${clientIp(req)}`, { max: BAD_SIG_RECORDS_PER_MIN }).ok) {
      const { event } = await recordInboundEvent({ provider, rawBody: raw })
      await finishInboundEvent(event, 'failed', 'invalid_signature')
    }
    return res.status(401).json({ error: 'Firma inválida' })
  }

  let payload
  try { payload = JSON.parse(raw) } catch { return res.status(400).json({ error: 'JSON inválido' }) }
  const { messages, statuses } = adapter.parseWebhook(payload)

  let failed = 0
  for (const m of messages) failed += await processUnit(provider, 'message', m)
  for (const s of statuses) failed += await processUnit(provider, 'status', s)
  return res.status(failed ? 500 : 200).json({ ok: !failed })
}
