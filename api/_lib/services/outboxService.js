import { supabaseAdmin } from '../supabaseAdmin.js'
import { backoffDelayMs } from '../events/backoff.js'

// =====================================================
// Vendra Pedidos — outbox de notificaciones salientes.
// Separación explícita:
//   evento entrante (webhook)  = fuente externa: puede duplicarse o llegar desordenado  → events/inbox.js
//   notificación saliente      = intención local durable, reintentable y auditable     → este archivo
//
// Garantía: al-menos-una-vez. Un handler puede ejecutarse dos veces para la misma fila
// (p. ej. el worker muere tras enviar y antes de marcar): debe ser idempotente y usar
// `row.id` como clave de idempotencia ante el proveedor.
// Ninguna función aquí toca facturas, caja ni inventario.
// =====================================================

const UNIQUE_VIOLATION = '23505'
export const DEFAULT_MAX_ATTEMPTS = 5
export const LEASE_MS = 5 * 60_000   // una fila 'processing' más vieja que esto se reclama (el worker murió)
export const BATCH_SIZE = 20
const ERR_LIMIT = 500

/** Error de un handler que no debe reintentarse (dato inválido, destinatario inexistente…). */
export class PermanentError extends Error {
  constructor(message) { super(message); this.name = 'PermanentError'; this.permanent = true }
}

/**
 * Encola una notificación. Idempotente por `dedupeKey` (por tenant): encolar dos veces el
 * mismo hecho devuelve { duplicate: true } sin crear otra fila.
 * `payload` sin datos personales; el handler los resuelve por tenant_id + aggregate_id.
 */
export async function enqueue({ tenantId, eventType, aggregateType, aggregateId, payload = {}, dedupeKey = null, maxAttempts = DEFAULT_MAX_ATTEMPTS, now = new Date() }) {
  if (!tenantId || !eventType || !aggregateType || !aggregateId) throw new Error('enqueue: tenantId, eventType, aggregateType y aggregateId son obligatorios')
  const { data, error } = await supabaseAdmin.from('connect_outbox').insert({
    tenant_id: tenantId, event_type: eventType, aggregate_type: aggregateType, aggregate_id: aggregateId,
    payload, status: 'pending', attempts: 0, max_attempts: maxAttempts,
    next_attempt_at: now.toISOString(), dedupe_key: dedupeKey,
  }).select('id').maybeSingle()
  if (error?.code === UNIQUE_VIOLATION) return { duplicate: true }
  if (error) throw error
  return { duplicate: false, id: data?.id }
}

/**
 * Resultado de un intento → cambios a guardar (puro).
 * `row.attempts` ya cuenta el intento recién hecho (se incrementa al reclamar).
 */
export function settle(row, error, { now = new Date(), random = Math.random } = {}) {
  const updated_at = now.toISOString()
  if (!error) return { status: 'delivered', error_details: null, updated_at }
  const error_details = String(error.message || error).slice(0, ERR_LIMIT)
  if (error.permanent || row.attempts >= row.max_attempts) return { status: 'failed', error_details, updated_at }
  return {
    status: 'pending', error_details, updated_at,
    next_attempt_at: new Date(now.getTime() + backoffDelayMs(row.attempts, { random })).toISOString(),
  }
}

/** Reclama una fila (guarda optimista) e incrementa attempts. Devuelve la fila reclamada o null. */
async function claim(row, now) {
  const { data } = await supabaseAdmin.from('connect_outbox')
    .update({ status: 'processing', attempts: row.attempts + 1, updated_at: now.toISOString() })
    .eq('id', row.id).eq('tenant_id', row.tenant_id)
    .eq('status', row.status).eq('attempts', row.attempts) // otro worker la tomó primero → no devuelve fila
    .select('*').maybeSingle()
  return data || null
}

/**
 * Procesa un lote. Solo toma filas cuyo event_type tiene handler registrado: las demás
 * esperan en 'pending' (p. ej. mensajes de WhatsApp hasta que exista el adaptador).
 * Esta es la única lectura entre tenants (es el worker del sistema); toda escritura
 * posterior lleva el tenant_id de la fila.
 *
 * @param handlers { [event_type]: async (row) => void }  lanzar = fallo (PermanentError = sin reintento)
 * @returns { claimed, delivered, retried, failed }
 */
export async function processBatch({ handlers = {}, limit = BATCH_SIZE, now = new Date(), random = Math.random } = {}) {
  const summary = { claimed: 0, delivered: 0, retried: 0, failed: 0 }
  const types = Object.keys(handlers)
  if (!types.length) return summary

  const [{ data: due }, { data: stale }] = await Promise.all([
    supabaseAdmin.from('connect_outbox').select('*')
      .eq('status', 'pending').lte('next_attempt_at', now.toISOString()).in('event_type', types)
      .order('next_attempt_at', { ascending: true }).limit(limit),
    supabaseAdmin.from('connect_outbox').select('*')
      .eq('status', 'processing').lt('updated_at', new Date(now.getTime() - LEASE_MS).toISOString()).in('event_type', types)
      .order('updated_at', { ascending: true }).limit(limit),
  ])

  for (const candidate of [...(due || []), ...(stale || [])].slice(0, limit)) {
    const row = await claim(candidate, now)
    if (!row) continue
    summary.claimed++

    let failure = null
    try { await handlers[row.event_type](row) } catch (err) { failure = err }

    const patch = settle(row, failure, { now, random })
    const { error } = await supabaseAdmin.from('connect_outbox').update(patch)
      .eq('id', row.id).eq('tenant_id', row.tenant_id).eq('status', 'processing')
    if (error) throw error // la fila queda 'processing' y se reclama al vencer el arrendamiento
    if (patch.status === 'delivered') summary.delivered++
    else if (patch.status === 'failed') summary.failed++
    else summary.retried++
  }
  return summary
}
