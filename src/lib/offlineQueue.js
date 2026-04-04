// =====================================================
// PyroVenta — Cola offline persistente
// Encola operaciones cuando no hay red y las sincroniza
// cuando vuelve la conectividad.
// =====================================================

const QUEUE_KEY = 'pv_offline_queue'
const SYNCED_KEY = 'pv_offline_synced' // facturas creadas offline ya sincronizadas

// ---- Leer/escribir cola --------------------------------
function getQueue() {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY)) || []
  } catch { return [] }
}

function saveQueue(queue) {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue))
}

// ---- API pública ---------------------------------------

/** Encolar una operación para sincronizar después */
export function enqueue(operation) {
  const queue = getQueue()
  queue.push({
    id: crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2),
    ...operation,
    created_at: new Date().toISOString(),
    retries: 0,
    status: 'pending', // 'pending' | 'syncing' | 'synced' | 'failed'
  })
  saveQueue(queue)
  return queue.length
}

/** Obtener operaciones pendientes */
export function getPending() {
  return getQueue().filter(op => op.status === 'pending' || op.status === 'failed')
}

/** Obtener toda la cola (incluidas las sincronizadas) */
export function getAll() {
  return getQueue()
}

/** Marcar una operación como sincronizada */
export function markSynced(id, serverResponse) {
  const queue = getQueue()
  const idx = queue.findIndex(op => op.id === id)
  if (idx >= 0) {
    queue[idx].status = 'synced'
    queue[idx].synced_at = new Date().toISOString()
    queue[idx].server_response = serverResponse
    saveQueue(queue)
  }
}

/** Marcar como fallida */
export function markFailed(id, error) {
  const queue = getQueue()
  const idx = queue.findIndex(op => op.id === id)
  if (idx >= 0) {
    queue[idx].status = 'failed'
    queue[idx].retries += 1
    queue[idx].last_error = error
    saveQueue(queue)
  }
}

/** Limpiar operaciones sincronizadas (mantener últimas 50 por auditoría) */
export function cleanup() {
  const queue = getQueue()
  const synced = queue.filter(op => op.status === 'synced')
  const rest = queue.filter(op => op.status !== 'synced')
  const kept = synced.slice(-50)
  saveQueue([...rest, ...kept])
}

/** Eliminar una operación específica */
export function remove(id) {
  const queue = getQueue().filter(op => op.id !== id)
  saveQueue(queue)
}

/** Contar pendientes */
export function pendingCount() {
  return getPending().length
}

// ---- Sincronización ------------------------------------

/**
 * Intentar sincronizar todas las operaciones pendientes.
 * Recibe un `executor` que es una función async (operation) => serverResponse
 * que ejecuta la llamada al API real.
 */
export async function syncAll(executor) {
  const pending = getPending()
  const results = { synced: 0, failed: 0 }

  for (const op of pending) {
    try {
      const response = await executor(op)
      markSynced(op.id, response)
      results.synced++
    } catch (err) {
      markFailed(op.id, err.message || 'Error de sincronización')
      results.failed++
    }
  }

  cleanup()
  return results
}

// ---- Código de factura offline -------------------------

/**
 * Genera un código temporal de factura para modo offline.
 * Prefijo 'T' + 3 dígitos para distinguirlos de los reales.
 * Al sincronizar, el servidor asigna el código real.
 */
export function generateOfflineCode() {
  const num = Math.floor(Math.random() * 900) + 100
  return `T${num}`
}

// ---- Facturas offline guardadas localmente -------------
const OFFLINE_INVOICES_KEY = 'pv_offline_invoices'

export function saveOfflineInvoice(invoice) {
  try {
    const invoices = JSON.parse(localStorage.getItem(OFFLINE_INVOICES_KEY)) || []
    invoices.push(invoice)
    localStorage.setItem(OFFLINE_INVOICES_KEY, JSON.stringify(invoices))
  } catch { /* localStorage lleno */ }
}

export function getOfflineInvoices() {
  try {
    return JSON.parse(localStorage.getItem(OFFLINE_INVOICES_KEY)) || []
  } catch { return [] }
}

export function clearSyncedOfflineInvoices(syncedIds) {
  try {
    const invoices = getOfflineInvoices().filter(inv => !syncedIds.includes(inv._offline_id))
    localStorage.setItem(OFFLINE_INVOICES_KEY, JSON.stringify(invoices))
  } catch { /* ignore */ }
}
