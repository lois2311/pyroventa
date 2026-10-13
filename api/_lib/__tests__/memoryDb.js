import { randomUUID } from 'node:crypto'

// BD en memoria para tests de rutas: imita lo que usa el backend de Vendra Pedidos del query builder
// de supabase-js (eq/in/lt/lte/gte, order, limit, insert/update/delete, single/maybeSingle) y los
// índices únicos de las migraciones. No proyecta columnas (select devuelve la fila entera).
// Uso: vi.mock('../supabaseAdmin.js', async () => ({ supabaseAdmin: (await import('./memoryDb.js')).makeSupabase(() => state.db) }))

const ACTIVE = ['ready_for_dispatch', 'assigned', 'picked_up']
const UNIQUE = {
  deliveries: (a, b) => (a.tenant_id === b.tenant_id && a.idempotency_key != null && a.idempotency_key === b.idempotency_key)
    || (a.order_request_id === b.order_request_id && ACTIVE.includes(a.status) && ACTIVE.includes(b.status)),
  connect_outbox: (a, b) => a.dedupe_key != null && a.tenant_id === b.tenant_id && a.dedupe_key === b.dedupe_key,
  customers: (a, b) => a.tenant_id === b.tenant_id && a.phone === b.phone,
  conversations: (a, b) => a.tenant_id === b.tenant_id && a.channel_id === b.channel_id && a.remote_chat_id === b.remote_chat_id,
  messages: (a, b) => a.tenant_id === b.tenant_id && ((a.remote_message_id != null && a.remote_message_id === b.remote_message_id)
    || (a.idempotency_key != null && a.idempotency_key === b.idempotency_key)),
  order_requests: (a, b) => a.idempotency_key != null && a.tenant_id === b.tenant_id && a.idempotency_key === b.idempotency_key,
  payment_records: (a, b) => a.order_request_id === b.order_request_id,
  integration_events: (a, b) => a.provider === b.provider && a.direction === b.direction
    && (a.remote_event_id != null ? a.remote_event_id === b.remote_event_id : (b.remote_event_id == null && a.event_hash === b.event_hash)),
}
const DEFAULTS = {
  deliveries: { status: 'assigned', collect_amount: 0 }, connect_outbox: { status: 'pending', attempts: 0, max_attempts: 5 },
  conversations: { status: 'open' }, messages: { status: 'received' }, integration_events: { status: 'received', attempts: 0 },
}
const OPS = {
  eq: (v, x) => v === x, in: (v, x) => x.includes(v), lt: (v, x) => v < x, lte: (v, x) => v <= x, gte: (v, x) => v >= x,
}

export function makeSupabase(getDb, { tenantScoped = [] } = {}) {
  return {
    from(table) {
      const q = { op: 'select', filters: [], order: null, limit: null, single: false, payload: null }
      const run = () => {
        const db = getDb()
        const rows = db[table] ||= []
        if (tenantScoped.includes(table)) {
          const ok = q.op === 'insert' ? [].concat(q.payload).every(p => p.tenant_id) : q.filters.some(f => f[0] === 'eq' && f[1] === 'tenant_id')
          if (!ok) throw new Error(`consulta ${q.op} a ${table} sin tenant_id`)
        }
        const out = (list) => {
          let l = structuredClone(list)
          if (q.order) l.sort((a, b) => (a[q.order.col] < b[q.order.col] ? -1 : a[q.order.col] > b[q.order.col] ? 1 : 0) * (q.order.asc ? 1 : -1))
          if (q.limit != null) l = l.slice(0, q.limit)
          return { data: q.single ? (l[0] ?? null) : l, error: null }
        }
        if (q.op === 'insert') {
          const created = []
          for (const p of [].concat(q.payload)) {
            const row = { ...(table === 'order_requests' && { public_token: (randomUUID() + randomUUID()).replace(/-/g, '') }), id: randomUUID(), created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...DEFAULTS[table], ...p }
            if (UNIQUE[table] && rows.some(r => UNIQUE[table](row, r))) return { data: null, error: { code: '23505' } }
            rows.push(row); created.push(row)
          }
          return out(created)
        }
        const hit = rows.filter(r => q.filters.every(([op, col, val]) => OPS[op](r[col], val)))
        if (q.op === 'update') { hit.forEach(r => Object.assign(r, q.payload)); return out(hit) }
        if (q.op === 'delete') { db[table] = rows.filter(r => !hit.includes(r)); return out(hit) }
        return out(hit)
      }
      const chain = new Proxy({}, {
        get(_, prop) {
          if (prop === 'then') return (res, rej) => Promise.resolve().then(run).then(res, rej)
          return (...a) => {
            if (prop in OPS) q.filters.push([prop, ...a])
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
  }
}
