import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { randomUUID, createHmac } from 'node:crypto'
import { _resetForTests } from '../rateLimit.js'

// ---- BD en memoria con orden/limit (lo que usan bandeja y webhook) ----
const fake = vi.hoisted(() => ({ db: null, auth: null }))
const UNIQUE = {
  order_customers: (a, b) => a.tenant_id === b.tenant_id && a.phone === b.phone,
  conversations: (a, b) => a.tenant_id === b.tenant_id && a.channel_id === b.channel_id && a.remote_chat_id === b.remote_chat_id,
  messages: (a, b) => a.tenant_id === b.tenant_id && ((a.remote_message_id != null && a.remote_message_id === b.remote_message_id)
    || (a.idempotency_key != null && a.idempotency_key === b.idempotency_key)),
  connect_outbox: (a, b) => a.dedupe_key != null && a.tenant_id === b.tenant_id && a.dedupe_key === b.dedupe_key,
  integration_events: (a, b) => a.provider === b.provider && a.direction === b.direction
    && (a.remote_event_id != null ? a.remote_event_id === b.remote_event_id : (b.remote_event_id == null && a.event_hash === b.event_hash)),
}
const DEFAULTS = { conversations: { status: 'open' }, messages: { status: 'received' }, integration_events: { status: 'received', attempts: 0 }, connect_outbox: { status: 'pending', attempts: 0, max_attempts: 5 } }
const test_ = (r, [op, col, val]) => (op === 'eq' ? r[col] === val : op === 'in' ? val.includes(r[col]) : op === 'lt' ? r[col] < val : op === 'lte' ? r[col] <= val : true)
// Tablas de negocio: toda consulta lleva tenant_id (salvo la resolución global del canal por número o token)
const TENANT_SCOPED = ['order_customers', 'conversations', 'messages', 'order_requests']

vi.mock('../supabaseAdmin.js', () => ({
  supabaseAdmin: {
    from(table) {
      const db = fake.db
      const q = { op: 'select', filters: [], order: null, limit: null, single: false, payload: null }
      const run = () => {
        const rows = db[table] ||= []
        if (TENANT_SCOPED.includes(table)) {
          const ok = q.op === 'insert' ? [].concat(q.payload).every(p => p.tenant_id) : q.filters.some(f => f[0] === 'eq' && f[1] === 'tenant_id')
          if (!ok) throw new Error(`consulta ${q.op} a ${table} sin tenant_id`)
        }
        if (db.failOn?.table === table && db.failOn.op === q.op && db.failOn.times > 0) { db.failOn.times--; return { data: null, error: { code: 'XX000', message: 'boom' } } }
        const out = (list) => {
          let l = structuredClone(list)
          if (q.order) l.sort((a, b) => (a[q.order.col] < b[q.order.col] ? -1 : 1) * (q.order.asc ? 1 : -1))
          if (q.limit != null) l = l.slice(0, q.limit)
          return { data: q.single ? (l[0] ?? null) : l, error: null }
        }
        if (q.op === 'insert') {
          const created = []
          for (const p of [].concat(q.payload)) {
            const row = { id: randomUUID(), created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...DEFAULTS[table], ...p }
            if (UNIQUE[table] && rows.some(r => UNIQUE[table](row, r))) return { data: null, error: { code: '23505' } }
            rows.push(row); created.push(row)
          }
          return out(created)
        }
        const hit = rows.filter(r => q.filters.every(f => test_(r, f)))
        if (q.op === 'update') { hit.forEach(r => Object.assign(r, q.payload)); return out(hit) }
        if (q.op === 'delete') { db[table] = rows.filter(r => !hit.includes(r)); return out(hit) }
        return out(hit)
      }
      const chain = new Proxy({}, {
        get(_, prop) {
          if (prop === 'then') return (res, rej) => Promise.resolve().then(run).then(res, rej)
          return (...a) => {
            if (['eq', 'in', 'lt', 'lte'].includes(prop)) q.filters.push([prop, ...a])
            else if (['insert', 'update', 'delete'].includes(prop)) { q.op = prop; q.payload = a[0] }
            else if (prop === 'order') q.order = { col: a[0], asc: a[1]?.ascending !== false }
            else if (prop === 'limit') q.limit = a[0]
            else if (prop === 'maybeSingle' || prop === 'single') q.single = true
            return chain
          }
        },
      })
      return chain
    },
  },
}))
vi.mock('../auth.js', () => ({ requireCan: async () => fake.auth, requireAuth: async () => fake.auth }))

const { whatsappWebhookVerify, whatsappWebhookPost } = await import('../routes/whatsappRoutes.js')
const { conversationsList, conversationMessages, messageSend } = await import('../routes/conversationRoutes.js')
const { deliverMessage, orderNotification } = await import('../events/whatsappHandlers.js')
const { handlers } = await import('../events/handlers.js')
const { ORDER_EVENTS } = await import('../events/orderEvents.js')
const { verifySignature, parseWebhook, sendTextMessage } = await import('../adapters/whatsappAdapter.js')
const { PermanentError } = await import('../services/outboxService.js')
const { purgeExpired } = await import('../events/retention.js')
const { nextStatus, windowOpen, waIdToE164, WINDOW_MS } = await import('../services/conversationService.js')

const SECRET = 'app-secret-de-prueba'
const TENANT = randomUUID(), OTHER_TENANT = randomUUID()
const LOC = randomUUID(), OTHER_LOC = randomUUID()
const CHANNEL = randomUUID()
const PHONE_ID = '1098765432100'
const VERIFY = 'verify-token-pilot'
const WA_ID = '573001234567'

const sign = (raw) => `sha256=${createHmac('sha256', SECRET).update(raw).digest('hex')}`
const nowSec = () => String(Math.floor(Date.now() / 1000))
const waMsg = (over = {}) => ({ id: 'wamid.AAA', from: WA_ID, timestamp: nowSec(), type: 'text', text: { body: 'Hola, ¿tienen volcanes? 🎆' }, ...over })
const payload = (messages = [], statuses = [], phoneNumberId = PHONE_ID) => ({
  object: 'whatsapp_business_account',
  entry: [{ id: '1', changes: [{ field: 'messages', value: {
    messaging_product: 'whatsapp', metadata: { phone_number_id: phoneNumberId, display_phone_number: '573000000000' },
    contacts: messages.map(m => ({ wa_id: m.from, profile: { name: 'Ana Pérez' } })), messages, statuses } }] }],
})
// Meta firma el cuerpo con los caracteres no ASCII escapados (\uXXXX)
const metaRaw = (body) => JSON.stringify(body).replace(/[\u0080-￿]/g, c => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`)

const respond = () => {
  const r = { code: 200, headers: {} }
  r.status = (c) => { r.code = c; return r }
  r.json = (b) => { r.body = b; return r }
  r.send = (b) => { r.body = b; return r }
  r.setHeader = (k, v) => { r.headers[k] = v }
  return r
}
const post = async (body, { sig, raw } = {}) => {
  const rawBody = raw ?? (typeof body === 'string' ? body : metaRaw(body))
  const res = respond()
  await whatsappWebhookPost({ headers: { 'x-hub-signature-256': sig ?? sign(rawBody), 'x-forwarded-for': '9.9.9.9' }, rawBody }, res, 'meta')
  return res
}
const events = () => fake.db.integration_events

beforeEach(() => {
  _resetForTests()
  process.env.META_APP_SECRET = SECRET
  process.env.WA_TOKEN_TEST = 'tok-secreto-123'
  fake.db = {
    whatsapp_channels: [{ id: CHANNEL, tenant_id: TENANT, location_id: LOC, provider: 'meta', phone_number_id: PHONE_ID, status: 'active', webhook_verify_token: VERIFY, access_token_secret_ref: 'WA_TOKEN_TEST' }],
    order_customers: [], conversations: [], messages: [], integration_events: [], connect_outbox: [], order_requests: [],
  }
  fake.auth = { tenantId: TENANT, seller: { id: randomUUID(), name: 'Cajera', role: 'cashier' }, scope: { all: false, locationIds: [LOC] } }
})
afterEach(() => { delete process.env.META_APP_SECRET; delete process.env.WA_TOKEN_TEST })

// ---- Adaptador (puro) --------------------------------
describe('adaptador Meta', () => {
  it('verifySignature: acepta la firma correcta y rechaza alterada, ausente o con otro secreto', () => {
    const raw = '{"a":"ñ"}'
    expect(verifySignature(raw, sign(raw), SECRET)).toBe(true)
    expect(verifySignature(raw + ' ', sign(raw), SECRET)).toBe(false)
    expect(verifySignature(raw, undefined, SECRET)).toBe(false)
    expect(verifySignature(raw, 'sha256=zz', SECRET)).toBe(false)
    expect(verifySignature(raw, sign(raw), 'otro')).toBe(false)
    expect(verifySignature(raw, sign(raw), '')).toBe(false)
  })

  it('parseWebhook normaliza mensajes (texto, imagen, interactivo, no soportado) y estados', () => {
    const body = payload([
      waMsg(), waMsg({ id: 'w2', type: 'image', text: undefined, image: { id: 'media1', caption: 'mira' } }),
      waMsg({ id: 'w3', type: 'interactive', text: undefined, interactive: { button_reply: { title: 'Sí' } } }),
      waMsg({ id: 'w4', type: 'audio', text: undefined }),
    ], [{ id: 'wamid.OUT', status: 'delivered', timestamp: nowSec(), recipient_id: WA_ID }, { id: 'x', status: 'deleted', timestamp: nowSec() }])
    const { messages, statuses } = parseWebhook(body)
    expect(messages.map(m => [m.type, m.body])).toEqual([['text', 'Hola, ¿tienen volcanes? 🎆'], ['image', 'mira'], ['interactive', 'Sí'], ['text', '[mensaje no soportado: audio]']])
    expect(messages[0]).toMatchObject({ phoneNumberId: PHONE_ID, from: WA_ID, name: 'Ana Pérez' })
    expect(statuses).toHaveLength(1) // 'deleted' se descarta
    expect(parseWebhook({}).messages).toEqual([])
  })

  it('sendTextMessage: ok devuelve el id; 429/5xx y red reintentan; 4xx es permanente; el token no aparece en errores', async () => {
    const cfg = { phoneNumberId: PHONE_ID, accessToken: 'tok-secreto-123' }
    const reply = (status, json) => vi.fn(async () => ({ ok: status < 300, status, json: async () => json }))
    const f = reply(200, { messages: [{ id: 'wamid.OUT1' }] })
    expect(await sendTextMessage({ to: WA_ID, text: 'hola', channelConfig: cfg, fetchImpl: f })).toBe('wamid.OUT1')
    const [url, opts] = f.mock.calls[0]
    expect(url).toContain(`/${PHONE_ID}/messages`)
    expect(opts.headers.Authorization).toBe('Bearer tok-secreto-123')
    expect(JSON.parse(opts.body)).toMatchObject({ messaging_product: 'whatsapp', to: WA_ID, type: 'text', text: { body: 'hola' } })

    for (const status of [429, 500, 503]) {
      const err = await sendTextMessage({ to: WA_ID, text: 'x', channelConfig: cfg, fetchImpl: reply(status, { error: { message: 'busy' } }) }).catch(e => e)
      expect(err.permanent).toBeUndefined()
    }
    const perm = await sendTextMessage({ to: WA_ID, text: 'x', channelConfig: cfg, fetchImpl: reply(400, { error: { code: 131047, message: 'Re-engagement message' } }) }).catch(e => e)
    expect(perm).toBeInstanceOf(PermanentError)
    expect(perm.message).toContain('131047')
    expect(perm.message).not.toContain('tok-secreto')
    const net = await sendTextMessage({ to: WA_ID, text: 'x', channelConfig: cfg, fetchImpl: vi.fn(async () => { throw new TypeError('fetch failed tok-secreto-123') }) }).catch(e => e)
    expect(net.permanent).toBeUndefined()
    expect(net.message).not.toContain('tok-secreto')
    await expect(sendTextMessage({ to: WA_ID, text: 'x', channelConfig: {} })).rejects.toThrow(/credenciales/)
  })
})

describe('reglas de conversación', () => {
  it('nextStatus solo avanza; failed no pisa read', () => {
    expect(nextStatus('sent', 'delivered')).toBe('delivered')
    expect(nextStatus('read', 'delivered')).toBe('read')
    expect(nextStatus('delivered', 'sent')).toBe('delivered')
    expect(nextStatus('queued', 'failed')).toBe('failed')
    expect(nextStatus('read', 'failed')).toBe('read')
  })
  it('ventana de 24 h y wa_id → E.164', () => {
    const now = new Date()
    expect(windowOpen({ last_inbound_at: new Date(now - WINDOW_MS + 60_000).toISOString() }, now)).toBe(true)
    expect(windowOpen({ last_inbound_at: new Date(now - WINDOW_MS - 1000).toISOString() }, now)).toBe(false)
    expect(windowOpen({ last_inbound_at: null }, now)).toBe(false)
    expect(waIdToE164('573001234567')).toBe('+573001234567')
    expect(waIdToE164('abc')).toBeNull()
  })
})

// ---- Webhook: handshake ------------------------------
describe('GET webhook (handshake de Meta)', () => {
  const verify = async (query, provider = 'meta') => { const res = respond(); await whatsappWebhookVerify({ query }, res, provider); return res }
  it('con token válido devuelve el challenge como texto', async () => {
    const res = await verify({ 'hub.mode': 'subscribe', 'hub.verify_token': VERIFY, 'hub.challenge': '1158201444' })
    expect(res.code).toBe(200)
    expect(res.body).toBe('1158201444')
    expect(res.headers['Content-Type']).toBe('text/plain')
  })
  it('token incorrecto, modo distinto o sin challenge → 403; proveedor desconocido → 404', async () => {
    expect((await verify({ 'hub.mode': 'subscribe', 'hub.verify_token': 'malo', 'hub.challenge': '1' })).code).toBe(403)
    expect((await verify({ 'hub.mode': 'unsubscribe', 'hub.verify_token': VERIFY, 'hub.challenge': '1' })).code).toBe(403)
    expect((await verify({ 'hub.mode': 'subscribe', 'hub.verify_token': VERIFY })).code).toBe(403)
    expect((await verify({}, 'meta')).code).toBe(403)
    expect((await verify({ 'hub.mode': 'subscribe', 'hub.verify_token': VERIFY, 'hub.challenge': '1' }, 'twilio')).code).toBe(404)
  })
})

// ---- Webhook: firma y mensajes entrantes -------------
describe('POST webhook', () => {
  it('firma inválida → 401, deja constancia del intento (solo hash) y no crea nada', async () => {
    const res = await post(payload([waMsg()]), { sig: 'sha256=' + '0'.repeat(64) })
    expect(res.code).toBe(401)
    expect(events()).toHaveLength(1)
    expect(events()[0]).toMatchObject({ status: 'failed', error_details: 'invalid_signature', tenant_id: null, payload: null })
    expect(events()[0].event_hash).toMatch(/^[a-f0-9]{64}$/)
    expect(fake.db.conversations).toHaveLength(0)
    expect(fake.db.messages).toHaveLength(0)
  })

  it('sin firma → 401; sin META_APP_SECRET → 503; sin cuerpo crudo → 500; JSON inválido firmado → 400', async () => {
    const raw = metaRaw(payload([waMsg()]))
    const res = respond()
    await whatsappWebhookPost({ headers: {}, rawBody: raw }, res, 'meta')
    expect(res.code).toBe(401)
    const noRaw = respond(); await whatsappWebhookPost({ headers: {} }, noRaw, 'meta')
    expect(noRaw.code).toBe(500)
    expect((await post('{no es json', {})).code).toBe(400)
    delete process.env.META_APP_SECRET
    expect((await post(payload([waMsg()]))).code).toBe(503)
  })

  it('el registro de firmas inválidas está acotado por IP (no es un vector de relleno)', async () => {
    for (let i = 0; i < 25; i++) await post(payload([waMsg({ id: `w${i}` })]), { sig: 'sha256=' + '1'.repeat(64) })
    expect(events().length).toBeLessThanOrEqual(20)
  })

  it('mensaje válido (con tildes y emoji escapados): crea cliente, conversación y mensaje', async () => {
    const res = await post(payload([waMsg()]))
    expect(res.code).toBe(200)
    expect(fake.db.order_customers[0]).toMatchObject({ tenant_id: TENANT, phone: '+573001234567', name: 'Ana Pérez' })
    const conv = fake.db.conversations[0]
    expect(conv).toMatchObject({ tenant_id: TENANT, location_id: LOC, channel_id: CHANNEL, remote_chat_id: WA_ID, status: 'open', last_message_preview: 'Hola, ¿tienen volcanes? 🎆' })
    expect(conv.last_inbound_at).toBeTruthy()
    expect(fake.db.messages[0]).toMatchObject({ tenant_id: TENANT, conversation_id: conv.id, direction: 'inbound', type: 'text', body: 'Hola, ¿tienen volcanes? 🎆', remote_message_id: 'wamid.AAA', status: 'received' })
    expect(events()[0]).toMatchObject({ status: 'processed', tenant_id: TENANT, remote_event_id: 'wamid.AAA', direction: 'inbound' })
  })

  it('el mismo webhook repetido no duplica conversación, mensaje ni cliente', async () => {
    const body = payload([waMsg()])
    await post(body); const again = await post(body)
    expect(again.code).toBe(200)
    expect(fake.db.conversations).toHaveLength(1)
    expect(fake.db.messages).toHaveLength(1)
    expect(fake.db.order_customers).toHaveLength(1)
    expect(events()).toHaveLength(1)
  })

  it('un mensaje nuevo se agrega a la conversación existente y reabre una cerrada', async () => {
    await post(payload([waMsg()]))
    fake.db.conversations[0].status = 'closed'
    await post(payload([waMsg({ id: 'wamid.BBB', text: { body: 'Otro mensaje' } })]))
    expect(fake.db.conversations).toHaveLength(1)
    expect(fake.db.conversations[0]).toMatchObject({ status: 'open', last_message_preview: 'Otro mensaje' })
    expect(fake.db.messages).toHaveLength(2)
  })

  it('canal desconocido o desconectado: el evento se ignora y no crea nada', async () => {
    await post(payload([waMsg()], [], 'numero-que-no-existe'))
    expect(events()[0]).toMatchObject({ status: 'ignored', error_details: 'unknown_channel', tenant_id: null })
    fake.db.whatsapp_channels[0].status = 'disconnected'
    await post(payload([waMsg({ id: 'wamid.CCC' })]))
    expect(events()[1]).toMatchObject({ status: 'ignored', error_details: 'channel_disconnected' })
    expect(fake.db.conversations).toHaveLength(0)
    expect(fake.db.order_customers).toHaveLength(0)
  })

  it('un fallo al procesar responde 500 (Meta reintenta) y el reintento lo completa sin duplicar', async () => {
    const body = payload([waMsg()])
    fake.db.failOn = { table: 'messages', op: 'insert', times: 1 }
    expect((await post(body)).code).toBe(500)
    expect(events()[0]).toMatchObject({ status: 'failed', attempts: 1 })
    expect((await post(body)).code).toBe(200)
    expect(events()).toHaveLength(1)
    expect(events()[0].status).toBe('processed')
    expect(fake.db.messages).toHaveLength(1)
    expect(fake.db.conversations).toHaveLength(1)
  })

  it('estados de entrega: llegan desordenados, solo avanzan; un mensaje desconocido se ignora', async () => {
    fake.db.conversations.push({ id: 'c1', tenant_id: TENANT })
    fake.db.messages.push({ id: 'm1', tenant_id: TENANT, conversation_id: 'c1', direction: 'outbound', status: 'sent', remote_message_id: 'wamid.OUT' })
    const st = (status, id = 'wamid.OUT') => payload([], [{ id, status, timestamp: nowSec(), recipient_id: WA_ID }])
    await post(st('read')); await post(st('delivered'))
    expect(fake.db.messages[0].status).toBe('read')
    await post(st('delivered', 'wamid.DESCONOCIDO'))
    expect(events().find(e => e.remote_event_id === 'wamid.DESCONOCIDO:delivered')).toMatchObject({ status: 'ignored', error_details: 'unknown_message' })
    expect(events().map(e => e.remote_event_id)).toContain('wamid.OUT:read') // mismo wamid, estados distintos = eventos distintos
  })
})

// ---- Bandeja: lectura --------------------------------
const seedConversation = (over = {}) => {
  const c = { id: randomUUID(), tenant_id: TENANT, location_id: LOC, channel_id: CHANNEL, customer_id: null, remote_chat_id: WA_ID, status: 'open',
    last_message_at: new Date().toISOString(), last_inbound_at: new Date().toISOString(), last_message_preview: 'hola', ...over }
  fake.db.conversations.push(c); return c
}
const call = async (fn, req, ...args) => { const res = respond(); await fn(req, res, ...args); return res }

describe('GET /orders/conversations y mensajes', () => {
  it('lista por estado con cliente y ventana; respeta tenant y sede', async () => {
    const c = seedConversation(); seedConversation({ status: 'closed' })
    seedConversation({ tenant_id: OTHER_TENANT }); seedConversation({ location_id: OTHER_LOC })
    fake.db.order_customers.push({ id: 'cu1', tenant_id: TENANT, name: 'Ana Pérez', phone: '+573001234567' })
    c.customer_id = 'cu1'
    const res = await call(conversationsList, { query: {} })
    expect(res.body).toHaveLength(1)
    expect(res.body[0]).toMatchObject({ id: c.id, window_open: true, customer: { name: 'Ana Pérez', phone: '+573001234567' } })
    expect((await call(conversationsList, { query: { status: 'closed' } })).body).toHaveLength(1)
    expect((await call(conversationsList, { query: { status: 'x' } })).code).toBe(422)
    expect((await call(conversationsList, { query: { location_id: OTHER_LOC } })).code).toBe(403)
  })

  it('sin cliente registrado muestra el teléfono del chat', async () => {
    seedConversation()
    expect((await call(conversationsList, { query: {} })).body[0].customer).toEqual({ name: null, phone: '+' + WA_ID })
  })

  it('historial paginado en orden cronológico con cursor', async () => {
    const c = seedConversation()
    for (let i = 1; i <= 5; i++) {
      fake.db.messages.push({ id: 'm' + i, tenant_id: TENANT, conversation_id: c.id, direction: 'inbound', type: 'text', body: 'msg ' + i, status: 'received', created_at: new Date(Date.UTC(2026, 9, 14, 10, i)).toISOString() })
    }
    const page1 = await call(conversationMessages, { query: { limit: '2' } }, c.id)
    expect(page1.body.messages.map(m => m.body)).toEqual(['msg 4', 'msg 5'])
    expect(page1.body.next_before).toBe(new Date(Date.UTC(2026, 9, 14, 10, 4)).toISOString())
    const page2 = await call(conversationMessages, { query: { limit: '2', before: page1.body.next_before } }, c.id)
    expect(page2.body.messages.map(m => m.body)).toEqual(['msg 2', 'msg 3'])
    const last = await call(conversationMessages, { query: { limit: '2', before: page2.body.next_before } }, c.id)
    expect(last.body.messages.map(m => m.body)).toEqual(['msg 1'])
    expect(last.body.next_before).toBeNull()
    expect(page1.body.conversation.window_open).toBe(true)
  })

  it('aislamiento: otra empresa o sede ajena no se lee ni se responde', async () => {
    const foreign = seedConversation({ tenant_id: OTHER_TENANT })
    const outScope = seedConversation({ location_id: OTHER_LOC })
    for (const c of [foreign, outScope]) {
      const r = await call(conversationMessages, { query: {} }, c.id)
      expect([403, 404]).toContain(r.code)
    }
    expect((await call(conversationMessages, { query: {} }, 'no-uuid')).code).toBe(404)
    const send = await call(messageSend, { headers: { 'idempotency-key': 'clave-12345678' }, body: { text: 'hola' } }, foreign.id)
    expect(send.code).toBe(404)
    expect(fake.db.connect_outbox).toHaveLength(0)
  })
})

// ---- Respuesta humana → outbox -----------------------
describe('POST /orders/conversations/:id/messages', () => {
  const reply = (conv, text = 'Sí, tenemos stock', key = 'clave-12345678') =>
    call(messageSend, { headers: { 'idempotency-key': key }, body: { text } }, conv.id)

  it('guarda el mensaje en cola y encola message.outbound (una sola vez)', async () => {
    const c = seedConversation()
    const res = await reply(c)
    expect(res.code).toBe(201)
    expect(res.body).toMatchObject({ direction: 'outbound', body: 'Sí, tenemos stock', status: 'queued', sent_by: fake.auth.seller.id })
    expect(fake.db.connect_outbox).toHaveLength(1)
    expect(fake.db.connect_outbox[0]).toMatchObject({ tenant_id: TENANT, event_type: 'message.outbound', aggregate_type: 'conversation', aggregate_id: c.id, status: 'pending', payload: { message_id: res.body.id } })
    expect(fake.db.conversations[0].last_message_preview).toBe('Sí, tenemos stock')
  })

  it('misma Idempotency-Key: devuelve el mismo mensaje sin duplicar mensaje ni evento', async () => {
    const c = seedConversation()
    const first = await reply(c)
    const again = await reply(c)
    expect(again.code).toBe(200)
    expect(again.body.id).toBe(first.body.id)
    expect(fake.db.messages).toHaveLength(1)
    expect(fake.db.connect_outbox).toHaveLength(1)
  })

  it('si el encolado falló tras guardar el mensaje, el reintento lo repara', async () => {
    const c = seedConversation()
    fake.db.failOn = { table: 'connect_outbox', op: 'insert', times: 1 }
    await expect(reply(c)).rejects.toBeTruthy()
    expect(fake.db.messages).toHaveLength(1)
    expect(fake.db.connect_outbox).toHaveLength(0)
    expect((await reply(c)).code).toBe(200)
    expect(fake.db.connect_outbox).toHaveLength(1)
    expect(fake.db.messages).toHaveLength(1)
  })

  it('valida clave, texto y ventana de 24 h (409 sin guardar nada)', async () => {
    const c = seedConversation()
    expect((await call(messageSend, { headers: {}, body: { text: 'x' } }, c.id)).code).toBe(400)
    expect((await reply(c, '   ')).code).toBe(422)
    expect((await reply(c, 'x'.repeat(1001))).code).toBe(422)
    const old = seedConversation({ remote_chat_id: '573009999999', last_inbound_at: new Date(Date.now() - WINDOW_MS - 60_000).toISOString() })
    const closed = await reply(old, 'hola', 'clave-87654321')
    expect(closed.code).toBe(409)
    expect(closed.body.error).toMatch(/24 h/)
    expect(fake.db.messages).toHaveLength(0)
    expect(fake.db.connect_outbox).toHaveLength(0)
  })
})

// ---- Envío real por el outbox ------------------------
describe('handlers del outbox → WhatsApp', () => {
  const fetchOk = (id = 'wamid.OUT1') => vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ messages: [{ id }] }) }))
  const fetchFail = (status, error = { message: 'x' }) => vi.fn(async () => ({ ok: false, status, json: async () => ({ error }) }))
  const rowFor = (over = {}) => ({ id: randomUUID(), tenant_id: TENANT, attempts: 1, max_attempts: 5, ...over })
  const queued = (conv, over = {}) => {
    const m = { id: randomUUID(), tenant_id: TENANT, conversation_id: conv.id, direction: 'outbound', type: 'text', body: 'Hola Ana', status: 'queued', ...over }
    fake.db.messages.push(m)
    return m
  }

  it('registra todos los tipos de evento de pedido y la respuesta humana', () => {
    expect(Object.keys(handlers).sort()).toEqual(['message.outbound', ...Object.values(ORDER_EVENTS)].sort())
  })

  it('envía con el token del canal, marca sent con el id de Meta y actualiza la conversación', async () => {
    const c = seedConversation()
    const m = queued(c)
    const f = fetchOk()
    await deliverMessage(rowFor(), m.id, { fetchImpl: f })
    const [url, opts] = f.mock.calls[0]
    expect(url).toContain(`/${PHONE_ID}/messages`)
    expect(opts.headers.Authorization).toBe('Bearer tok-secreto-123') // resuelto desde WA_TOKEN_TEST
    expect(JSON.parse(opts.body)).toMatchObject({ to: WA_ID, text: { body: 'Hola Ana' } })
    expect(fake.db.messages[0]).toMatchObject({ status: 'sent', remote_message_id: 'wamid.OUT1' })
    expect(fake.db.conversations[0].last_message_preview).toBe('Hola Ana')
  })

  it('es idempotente: un mensaje ya enviado no se reenvía', async () => {
    const c = seedConversation()
    const m = queued(c, { status: 'sent' })
    const f = fetchOk()
    await deliverMessage(rowFor(), m.id, { fetchImpl: f })
    expect(f).not.toHaveBeenCalled()
  })

  it('error transitorio: se relanza y el mensaje sigue en cola; en el último intento queda failed', async () => {
    const c = seedConversation()
    const m = queued(c)
    await expect(deliverMessage(rowFor({ attempts: 1 }), m.id, { fetchImpl: fetchFail(503) })).rejects.toThrow(/503/)
    expect(fake.db.messages[0].status).toBe('queued')
    await expect(deliverMessage(rowFor({ attempts: 5 }), m.id, { fetchImpl: fetchFail(503) })).rejects.toThrow()
    expect(fake.db.messages[0].status).toBe('failed')
  })

  it('error permanente (4xx), canal desconectado o fuera de ventana: failed de inmediato y sin reintento', async () => {
    const c = seedConversation()
    const m = queued(c)
    const e1 = await deliverMessage(rowFor(), m.id, { fetchImpl: fetchFail(400, { code: 131047, message: 're-engagement' }) }).catch(e => e)
    expect(e1).toBeInstanceOf(PermanentError)
    expect(fake.db.messages[0].status).toBe('failed')

    const m2 = queued(c)
    fake.db.whatsapp_channels[0].status = 'disconnected'
    const f = fetchOk()
    expect(await deliverMessage(rowFor(), m2.id, { fetchImpl: f }).catch(e => e)).toBeInstanceOf(PermanentError)
    expect(f).not.toHaveBeenCalled()
    fake.db.whatsapp_channels[0].status = 'active'

    const stale = seedConversation({ remote_chat_id: '573008888888', last_inbound_at: new Date(Date.now() - WINDOW_MS - 1000).toISOString() })
    const m3 = queued(stale)
    expect(await deliverMessage(rowFor(), m3.id, { fetchImpl: f }).catch(e => e)).toMatchObject({ permanent: true })
    expect(fake.db.messages.find(x => x.id === m3.id).status).toBe('failed')
    expect(f).not.toHaveBeenCalled()
  })

  it('notificación de pedido: usa la conversación del cliente, redacta el texto y un reintento no crea otro mensaje', async () => {
    const c = seedConversation()
    fake.db.order_customers.push({ id: 'cu1', tenant_id: TENANT, phone: '+' + WA_ID, name: 'Ana' })
    const order = { id: 'abcdef12-0000-4000-8000-000000000000', tenant_id: TENANT, location_id: LOC, customer_id: 'cu1', total: 25000, reject_reason: 'Fuera de zona' }
    fake.db.order_requests.push(order)
    const row = rowFor({ aggregate_id: order.id })
    const f = fetchOk('wamid.N1')
    await orderNotification(ORDER_EVENTS.accepted)(row, { fetchImpl: f })
    expect(JSON.parse(f.mock.calls[0][1].body).text.body).toBe('Tu pedido #ABCDEF12 fue aceptado. Total: $25.000.')
    expect(fake.db.messages).toHaveLength(1)
    expect(fake.db.messages[0]).toMatchObject({ conversation_id: c.id, status: 'sent', idempotency_key: `outbox:${row.id}` })

    await orderNotification(ORDER_EVENTS.accepted)(row, { fetchImpl: f }) // reintento de la misma fila
    expect(f).toHaveBeenCalledTimes(1)
    expect(fake.db.messages).toHaveLength(1)

    const rej = rowFor({ aggregate_id: order.id })
    await orderNotification(ORDER_EVENTS.rejected)(rej, { fetchImpl: fetchOk('wamid.N2') })
    expect(fake.db.messages.at(-1).body).toBe('No pudimos aceptar tu pedido #ABCDEF12. Motivo: Fuera de zona')
  })

  it('notificación sin conversación o fuera de ventana: falla permanente y visible, sin enviar', async () => {
    fake.db.order_customers.push({ id: 'cu1', tenant_id: TENANT, phone: '+' + WA_ID })
    const order = { id: randomUUID(), tenant_id: TENANT, location_id: LOC, customer_id: 'cu1', total: 1000 }
    fake.db.order_requests.push(order)
    const f = fetchOk()
    const sin = await orderNotification(ORDER_EVENTS.submitted)(rowFor({ aggregate_id: order.id }), { fetchImpl: f }).catch(e => e)
    expect(sin).toMatchObject({ permanent: true })
    expect(sin.message).toMatch(/plantilla/)
    seedConversation({ last_inbound_at: new Date(Date.now() - WINDOW_MS - 1000).toISOString() })
    expect(await orderNotification(ORDER_EVENTS.submitted)(rowFor({ aggregate_id: order.id }), { fetchImpl: f }).catch(e => e)).toMatchObject({ permanent: true })
    expect(f).not.toHaveBeenCalled()
    expect(fake.db.messages).toHaveLength(0)
  })

  it('aislamiento: no notifica con el canal de otra empresa', async () => {
    fake.db.whatsapp_channels.push({ id: randomUUID(), tenant_id: OTHER_TENANT, location_id: LOC, provider: 'meta', phone_number_id: 'otro', status: 'active', webhook_verify_token: 'o', access_token_secret_ref: 'X' })
    fake.db.whatsapp_channels[0].status = 'disconnected'
    fake.db.order_customers.push({ id: 'cu1', tenant_id: TENANT, phone: '+' + WA_ID })
    const order = { id: randomUUID(), tenant_id: TENANT, location_id: LOC, customer_id: 'cu1', total: 1 }
    fake.db.order_requests.push(order)
    const err = await orderNotification(ORDER_EVENTS.accepted)(rowFor({ aggregate_id: order.id }), { fetchImpl: fetchOk() }).catch(e => e)
    expect(err.message).toMatch(/canal de WhatsApp activo/)
  })
})

// ---- Retención ---------------------------------------
describe('purgeExpired (retención 30/90 días)', () => {
  const NOW = new Date('2026-10-14T12:00:00.000Z')
  const ago = (days) => new Date(NOW.getTime() - days * 86400_000).toISOString()
  it('borra procesados/ignorados/entregados >30 d y fallidos >90 d; conserva lo demás', async () => {
    const ev = (status, days) => fake.db.integration_events.push({ id: randomUUID(), status, created_at: ago(days) })
    ev('processed', 31); ev('ignored', 31); ev('processed', 29); ev('failed', 31); ev('failed', 91); ev('received', 200)
    const ob = (status, days) => fake.db.connect_outbox.push({ id: randomUUID(), tenant_id: TENANT, status, updated_at: ago(days) })
    ob('delivered', 31); ob('delivered', 5); ob('failed', 60); ob('failed', 100); ob('pending', 400)
    const r = await purgeExpired(NOW)
    expect(r).toEqual({ integration_events: 3, connect_outbox: 2 })
    expect(fake.db.integration_events.map(e => e.status).sort()).toEqual(['failed', 'processed', 'received'])
    expect(fake.db.connect_outbox.map(e => e.status).sort()).toEqual(['delivered', 'failed', 'pending'])
  })
})
