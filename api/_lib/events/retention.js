import { supabaseAdmin } from '../supabaseAdmin.js'

// =====================================================
// Retención de eventos técnicos (decisión de producto):
//   procesados / ignorados / entregados → 30 días
//   fallidos (los que soporte necesita revisar) → 90 días
// Aplica a integration_events y connect_outbox. NO borra mensajes, conversaciones ni pedidos
// (su retención y la de las evidencias de pago siguen pendientes de decisión).
// Mantenimiento del sistema: corre entre tenants, como el worker del outbox.
// =====================================================

export const RETENTION_DAYS = { done: 30, failed: 90 }
const DAY_MS = 24 * 60 * 60 * 1000

/** @returns { integration_events, connect_outbox } filas borradas */
export async function purgeExpired(now = new Date()) {
  const cutoff = (days) => new Date(now.getTime() - days * DAY_MS).toISOString()
  const del = async (table, statuses, dateCol, days) => {
    const { data, error } = await supabaseAdmin.from(table).delete()
      .in('status', statuses).lt(dateCol, cutoff(days)).select('id')
    if (error) throw error
    return data?.length || 0
  }
  return {
    integration_events:
      (await del('integration_events', ['processed', 'ignored'], 'created_at', RETENTION_DAYS.done))
      + (await del('integration_events', ['failed'], 'created_at', RETENTION_DAYS.failed)),
    connect_outbox:
      (await del('connect_outbox', ['delivered'], 'updated_at', RETENTION_DAYS.done))
      + (await del('connect_outbox', ['failed'], 'updated_at', RETENTION_DAYS.failed)),
  }
}
