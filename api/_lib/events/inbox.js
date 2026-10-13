import { createHash } from 'node:crypto'
import { supabaseAdmin } from '../supabaseAdmin.js'

// =====================================================
// Eventos entrantes (webhooks): registro durable + deduplicación.
// El ACK al proveedor nunca crea un pedido: primero se persiste el evento y
// un duplicado se reconoce sin reprocesarse (los proveedores reintentan).
// tenant_id puede ser null: un evento inválido o de canal desconocido se
// guarda igual, sin tenant que filtrar.
// =====================================================

const UNIQUE_VIOLATION = '23505'
const LIMIT_ERR = 500

export const eventHash = (raw) =>
  createHash('sha256').update(typeof raw === 'string' ? raw : JSON.stringify(raw)).digest('hex')

/**
 * Registra un evento entrante.
 * @param rawBody  cuerpo exacto recibido (firma/hash); si falta se usa JSON.stringify(payload)
 * @returns { duplicate: false, event } la primera vez; { duplicate: true, event } si ya existía
 *          (con su estado, para que el llamador decida si reprocesa un 'failed').
 */
export async function recordInboundEvent({ provider, remoteEventId = null, tenantId = null, payload = null, rawBody }) {
  if (!provider) throw new Error('provider requerido')
  const hash = eventHash(rawBody ?? payload ?? '')
  const row = {
    tenant_id: tenantId, provider, remote_event_id: remoteEventId, event_hash: hash,
    direction: 'inbound', status: 'received', payload, attempts: 0,
  }
  const ins = await supabaseAdmin.from('integration_events').insert(row).select('*').maybeSingle()
  if (!ins.error) return { duplicate: false, event: ins.data }
  if (ins.error.code !== UNIQUE_VIOLATION) throw ins.error

  let q = supabaseAdmin.from('integration_events').select('*').eq('provider', provider).eq('direction', 'inbound')
  q = remoteEventId ? q.eq('remote_event_id', remoteEventId) : q.eq('event_hash', hash)
  const { data: event } = await q.maybeSingle()
  return { duplicate: true, event }
}

/** Cierra el procesamiento de un evento: 'processed' | 'ignored' | 'failed'. */
export async function finishInboundEvent(event, status, error = null) {
  if (!['processed', 'ignored', 'failed'].includes(status)) throw new Error(`estado inválido: ${status}`)
  let q = supabaseAdmin.from('integration_events')
    .update({ status, attempts: (event.attempts || 0) + 1, error_details: error ? String(error.message || error).slice(0, LIMIT_ERR) : null })
    .eq('id', event.id)
  if (event.tenant_id) q = q.eq('tenant_id', event.tenant_id)
  const { error: dbErr } = await q
  if (dbErr) throw dbErr
}
