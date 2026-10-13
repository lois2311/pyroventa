import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { createFakeSupabase } from './fakeSupabase.js'
import { backoffDelayMs, BASE_DELAY_MS, MAX_DELAY_MS } from '../events/backoff.js'

// ---- Backoff (puro) ----------------------------------
describe('backoffDelayMs', () => {
  const min = () => 0
  const max = () => 0.999999
  it('crece exponencialmente; equal jitter ∈ [techo/2, techo]', () => {
    expect(backoffDelayMs(1, { random: min })).toBe(BASE_DELAY_MS / 2)
    expect(backoffDelayMs(1, { random: max })).toBe(BASE_DELAY_MS)
    expect(backoffDelayMs(2, { random: max })).toBe(BASE_DELAY_MS * 2)
    expect(backoffDelayMs(3, { random: max })).toBe(BASE_DELAY_MS * 4)
    expect(backoffDelayMs(3, { random: min })).toBe(BASE_DELAY_MS * 2)
  })
  it('respeta el tope', () => {
    const top = backoffDelayMs(30, { random: max })
    expect(top).toBeLessThanOrEqual(MAX_DELAY_MS)
    expect(top).toBeGreaterThan(MAX_DELAY_MS - 100)
    expect(backoffDelayMs(30, { random: min })).toBe(MAX_DELAY_MS / 2)
  })
  it('el jitter varía entre llamadas reales (no es constante)', () => {
    const set = new Set(Array.from({ length: 20 }, () => backoffDelayMs(4)))
    expect(set.size).toBeGreaterThan(1)
  })
})

// ---- BD en memoria -----------------------------------
const fake = vi.hoisted(() => ({ current: null }))
vi.mock('../supabaseAdmin.js', () => ({ supabaseAdmin: { from: (...a) => fake.current.from(...a) } }))
const { enqueue, settle, processBatch, PermanentError, LEASE_MS, DEFAULT_MAX_ATTEMPTS } = await import('../services/outboxService.js')
const { outboxRun } = await import('../routes/workerRoutes.js')
const { recordInboundEvent, finishInboundEvent, eventHash } = await import('../events/inbox.js')

const TENANT = randomUUID()
const OTHER = randomUUID()
const AGG = randomUUID()
const NOW = new Date('2026-10-14T15:00:00.000Z')
const iso = (ms) => new Date(NOW.getTime() + ms).toISOString()

let db
const UNIQUE = {
  connect_outbox: (a, b) => a.dedupe_key != null && a.tenant_id === b.tenant_id && a.dedupe_key === b.dedupe_key,
  integration_events: (a, b) => a.provider === b.provider && a.direction === b.direction
    && (a.remote_event_id != null ? a.remote_event_id === b.remote_event_id : (b.remote_event_id == null && a.event_hash === b.event_hash)),
}
const test_ = (r, [op, col, val]) => {
  const v = r[col]
  return op === 'eq' ? v === val : op === 'in' ? val.includes(v) : op === 'lt' ? v < val : op === 'lte' ? v <= val : true
}
const resolver = (q) => {
  const rows = db[q.table]
  const hit = () => rows.filter(r => q.filters.every(f => test_(r, f)))
  const out = (list) => { const c = structuredClone(list); return { data: q.single ? (c[0] ?? null) : c, error: null } }
  if (q.op === 'insert') {
    const row = { id: randomUUID(), created_at: NOW.toISOString(), updated_at: NOW.toISOString(), ...q.payload }
    if (rows.some(r => UNIQUE[q.table](row, r))) return { data: null, error: { code: '23505' } }
    rows.push(row); return out([row])
  }
  if (q.op === 'update') {
    // toda escritura del outbox debe estar acotada al tenant de la fila
    if (q.table === 'connect_outbox') expect(q.filters.some(f => f[0] === 'eq' && f[1] === 'tenant_id'), 'update outbox sin tenant_id').toBe(true)
    const h = hit(); h.forEach(r => Object.assign(r, q.payload)); return out(h)
  }
  return out(hit())
}

const seed = (over = {}) => {
  const row = {
    id: randomUUID(), tenant_id: TENANT, event_type: 'order.accepted', aggregate_type: 'order_request', aggregate_id: AGG, payload: {},
    status: 'pending', attempts: 0, max_attempts: 3, next_attempt_at: iso(-1000), error_details: null, dedupe_key: null,
    created_at: iso(-5000), updated_at: iso(-5000), ...over,
  }
  db.connect_outbox.push(row); return row
}
const byId = (id) => db.connect_outbox.find(r => r.id === id)
const run = (handlers, over = {}) => processBatch({ handlers, now: NOW, random: () => 0, ...over })

beforeEach(() => {
  db = { connect_outbox: [], integration_events: [] }
  fake.current = createFakeSupabase(resolver)
})

// ---- Encolado ----------------------------------------
describe('enqueue', () => {
  it('crea una fila pendiente con el tenant y los valores por defecto', async () => {
    const r = await enqueue({ tenantId: TENANT, eventType: 'order.accepted', aggregateType: 'order_request', aggregateId: AGG, payload: { a: 1 }, now: NOW })
    expect(r.duplicate).toBe(false)
    expect(db.connect_outbox[0]).toMatchObject({ tenant_id: TENANT, status: 'pending', attempts: 0, max_attempts: DEFAULT_MAX_ATTEMPTS, next_attempt_at: NOW.toISOString(), payload: { a: 1 } })
  })
  it('la misma dedupeKey no duplica; en otro tenant sí es otra fila', async () => {
    const e = { eventType: 'order.accepted', aggregateType: 'order_request', aggregateId: AGG, dedupeKey: 'order.accepted:1' }
    await enqueue({ tenantId: TENANT, ...e })
    expect((await enqueue({ tenantId: TENANT, ...e })).duplicate).toBe(true)
    expect((await enqueue({ tenantId: OTHER, ...e })).duplicate).toBe(false)
    expect(db.connect_outbox).toHaveLength(2)
  })
  it('exige tenant, tipo y agregado', async () => {
    await expect(enqueue({ eventType: 'x', aggregateType: 'y', aggregateId: AGG })).rejects.toThrow(/obligatorios/)
    await expect(enqueue({ tenantId: TENANT, aggregateType: 'y', aggregateId: AGG })).rejects.toThrow(/obligatorios/)
  })
})

// ---- Resultado de un intento (puro) ------------------
describe('settle', () => {
  const row = (attempts) => ({ attempts, max_attempts: 3 })
  it('éxito → delivered', () => expect(settle(row(1), null, { now: NOW })).toMatchObject({ status: 'delivered', error_details: null }))
  it('fallo con intentos disponibles → pending con espera de backoff', () => {
    const p = settle(row(1), new Error('timeout'), { now: NOW, random: () => 0 })
    expect(p).toMatchObject({ status: 'pending', error_details: 'timeout' })
    expect(p.next_attempt_at).toBe(iso(BASE_DELAY_MS / 2))
    expect(settle(row(2), new Error('x'), { now: NOW, random: () => 0 }).next_attempt_at).toBe(iso(BASE_DELAY_MS))
  })
  it('intentos agotados → failed (visible para soporte)', () => {
    expect(settle(row(3), new Error('timeout'), { now: NOW }).status).toBe('failed')
  })
  it('PermanentError falla de inmediato; el mensaje se trunca', () => {
    expect(settle(row(1), new PermanentError('sin destinatario'), { now: NOW }).status).toBe('failed')
    expect(settle(row(1), new Error('x'.repeat(2000)), { now: NOW }).error_details).toHaveLength(500)
  })
})

// ---- Worker ------------------------------------------
describe('processBatch', () => {
  it('entrega las filas vencidas con handler y marca delivered', async () => {
    const a = seed(); const b = seed()
    const seen = []
    const s = await run({ 'order.accepted': async (r) => { seen.push(r.id) } })
    expect(s).toEqual({ claimed: 2, delivered: 2, retried: 0, failed: 0 })
    expect(seen.sort()).toEqual([a.id, b.id].sort())
    expect([byId(a.id).status, byId(b.id).status]).toEqual(['delivered', 'delivered'])
    expect(byId(a.id).attempts).toBe(1)
  })

  it('un fallo reprograma con backoff y se reintenta cuando vence; al agotar max_attempts queda failed', async () => {
    const r = seed({ max_attempts: 2 })
    const boom = async () => { throw new Error('proveedor caído') }
    const first = await run({ 'order.accepted': boom })
    expect(first).toMatchObject({ claimed: 1, retried: 1 })
    expect(byId(r.id)).toMatchObject({ status: 'pending', attempts: 1, error_details: 'proveedor caído' })
    expect(byId(r.id).next_attempt_at).toBe(iso(BASE_DELAY_MS / 2))

    // todavía no vence → no se toca
    expect((await run({ 'order.accepted': boom })).claimed).toBe(0)

    // vence → segundo y último intento → failed
    const later = await run({ 'order.accepted': boom }, { now: new Date(NOW.getTime() + 10 * 60_000) })
    expect(later).toMatchObject({ claimed: 1, failed: 1 })
    expect(byId(r.id)).toMatchObject({ status: 'failed', attempts: 2 })
    // un failed no se reintenta nunca más
    expect((await run({ 'order.accepted': boom }, { now: new Date(NOW.getTime() + 24 * 3600_000) })).claimed).toBe(0)
  })

  it('PermanentError: failed en el primer intento', async () => {
    const r = seed()
    const s = await run({ 'order.accepted': async () => { throw new PermanentError('destinatario inexistente') } })
    expect(s.failed).toBe(1)
    expect(byId(r.id)).toMatchObject({ status: 'failed', attempts: 1 })
  })

  it('no toca tipos sin handler (esperan en pending) ni filas futuras', async () => {
    const other = seed({ event_type: 'whatsapp.message' })
    const future = seed({ next_attempt_at: iso(60_000) })
    const called = vi.fn()
    expect((await run({ 'order.accepted': called })).claimed).toBe(0)
    expect(called).not.toHaveBeenCalled()
    expect(byId(other.id).status).toBe('pending')
    expect(byId(future.id).status).toBe('pending')
    expect(await run({})).toEqual({ claimed: 0, delivered: 0, retried: 0, failed: 0 })
  })

  it('dos workers a la vez: cada fila la procesa uno solo (guarda optimista)', async () => {
    seed(); seed(); seed()
    const calls = []
    const handlers = { 'order.accepted': async (r) => { calls.push(r.id); await Promise.resolve() } }
    const [a, b] = await Promise.all([run(handlers), run(handlers)])
    expect(a.claimed + b.claimed).toBe(3)
    expect(new Set(calls).size).toBe(3)
    expect(calls).toHaveLength(3)
  })

  it('recupera una fila "processing" abandonada (worker muerto) tras el arrendamiento', async () => {
    const stuck = seed({ status: 'processing', attempts: 1, updated_at: iso(-LEASE_MS - 1000) })
    const fresh = seed({ status: 'processing', attempts: 1, updated_at: iso(-1000) }) // otro worker la está procesando
    const s = await run({ 'order.accepted': async () => {} })
    expect(s.delivered).toBe(1)
    expect(byId(stuck.id)).toMatchObject({ status: 'delivered', attempts: 2 })
    expect(byId(fresh.id).status).toBe('processing')
  })

  it('un evento venenoso no se reintenta para siempre: attempts crece al reclamar aunque el worker muera', async () => {
    const r = seed({ max_attempts: 2 })
    // simula crash: el handler "muere" tras reclamar y la fila queda processing
    const realFrom = fake.current.from
    fake.current.from = (t) => {
      const chain = realFrom(t)
      if (t !== 'connect_outbox') return chain
      // reclamar funciona; guardar el resultado falla (el proceso cae a mitad del lote)
      return new Proxy(chain, { get: (c, prop) => prop === 'update'
        ? (patch) => { if (patch.status !== 'processing') throw new Error('worker muerto'); return c.update(patch) }
        : c[prop] })
    }
    await expect(run({ 'order.accepted': async () => {} })).rejects.toThrow('worker muerto')
    expect(byId(r.id)).toMatchObject({ status: 'processing', attempts: 1 })
    fake.current.from = realFrom
    const s = await run({ 'order.accepted': async () => { throw new Error('x') } }, { now: new Date(NOW.getTime() + LEASE_MS + 60_000) })
    expect(s.failed).toBe(1) // 2.º intento = max_attempts → failed
    expect(byId(r.id).attempts).toBe(2)
  })

  it('las escrituras del worker llevan el tenant de cada fila', async () => {
    seed({ tenant_id: TENANT }); seed({ tenant_id: OTHER })
    await run({ 'order.accepted': async () => {} }) // el resolver falla si algún update no filtra por tenant
    expect(db.connect_outbox.map(r => r.status)).toEqual(['delivered', 'delivered'])
  })
})

// ---- Eventos entrantes: deduplicación ----------------
describe('recordInboundEvent', () => {
  const ev = (over = {}) => ({ provider: 'meta', remoteEventId: 'wamid.1', tenantId: TENANT, payload: { text: 'hola' }, ...over })

  it('el primer evento se guarda; repetirlo se reconoce como duplicado sin reinsertar', async () => {
    const first = await recordInboundEvent(ev())
    const again = await recordInboundEvent(ev())
    expect(first.duplicate).toBe(false)
    expect(again.duplicate).toBe(true)
    expect(again.event.id).toBe(first.event.id)
    expect(db.integration_events).toHaveLength(1)
    expect(db.integration_events[0]).toMatchObject({ direction: 'inbound', status: 'received', attempts: 0, event_hash: eventHash({ text: 'hola' }) })
  })

  it('la misma id en otro proveedor es otro evento', async () => {
    await recordInboundEvent(ev()); await recordInboundEvent(ev({ provider: 'twilio' }))
    expect(db.integration_events).toHaveLength(2)
  })

  it('sin id remoto deduplica por hash del cuerpo exacto', async () => {
    const raw = '{"a":1}'
    const first = await recordInboundEvent(ev({ remoteEventId: null, rawBody: raw }))
    expect((await recordInboundEvent(ev({ remoteEventId: null, rawBody: raw }))).duplicate).toBe(true)
    expect((await recordInboundEvent(ev({ remoteEventId: null, rawBody: '{"a":2}' }))).duplicate).toBe(false)
    expect(first.event.remote_event_id).toBeNull()
  })

  it('acepta tenant nulo (webhook inválido o canal desconocido)', async () => {
    const r = await recordInboundEvent(ev({ tenantId: null, remoteEventId: 'x1' }))
    expect(r.event.tenant_id).toBeNull()
  })

  it('un duplicado de un evento fallido devuelve su estado para decidir si se reprocesa', async () => {
    const { event } = await recordInboundEvent(ev())
    await finishInboundEvent(event, 'failed', new Error('boom'))
    const again = await recordInboundEvent(ev())
    expect(again.duplicate).toBe(true)
    expect(again.event).toMatchObject({ status: 'failed', attempts: 1, error_details: 'boom' })
  })

  it('finishInboundEvent solo acepta estados finales', async () => {
    const { event } = await recordInboundEvent(ev())
    await expect(finishInboundEvent(event, 'received')).rejects.toThrow(/inválido/)
    await finishInboundEvent(event, 'processed')
    expect(db.integration_events[0].status).toBe('processed')
  })
})

// ---- Disparador del worker ----------------------------
describe('GET|POST /internal/outbox/run', () => {
  const call = async (auth) => {
    const res = { code: 200 }; res.status = (c) => { res.code = c; return res }; res.json = (b) => { res.body = b; return res }
    await outboxRun({ headers: auth ? { authorization: auth } : {} }, res)
    return res
  }
  afterEach(() => { delete process.env.CRON_SECRET })

  it('sin CRON_SECRET queda deshabilitado (503)', async () => {
    delete process.env.CRON_SECRET
    expect((await call('Bearer x')).code).toBe(503)
  })
  it('rechaza sin credencial o con una incorrecta (401)', async () => {
    process.env.CRON_SECRET = 's3cret-largo'
    expect((await call()).code).toBe(401)
    expect((await call('Bearer otro')).code).toBe(401)
  })
  it('con la credencial correcta ejecuta un lote y devuelve solo conteos', async () => {
    process.env.CRON_SECRET = 's3cret-largo'
    seed() // sin handler registrado todavía: espera en pending
    const r = await call('Bearer s3cret-largo')
    expect(r.code).toBe(200)
    expect(r.body).toEqual({ claimed: 0, delivered: 0, retried: 0, failed: 0 })
  })
})
