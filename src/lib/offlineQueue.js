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

/**
 * Id de operación (UUID v4). Se genera una vez por venta y viaja en el body
 * como `client_op_id`: el servidor lo usa para no crear una segunda factura
 * si un reintento repite una petición que en realidad sí entró.
 * El fallback importa: crypto.randomUUID solo existe en contexto seguro.
 */
export function newOpId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  // RFC 4122 v4 armado a mano cuando randomUUID no está disponible
  const b = new Uint8Array(16)
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(b)
  else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256)
  b[6] = (b[6] & 0x0f) | 0x40
  b[8] = (b[8] & 0x3f) | 0x80
  const h = [...b].map(x => x.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

/** Encolar una operación para sincronizar después */
export function enqueue(operation) {
  const queue = getQueue()
  queue.push({
    id: newOpId(),
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
 * que ejecuta la llamada al API real (con `skipAuthRedirect: true`).
 *
 * - 401 (sesión inválida a mitad del reintento): NO se marca como fallida,
 *   queda `pending` para reintentar cuando haya una sesión válida.
 * - Otros 4xx permanentes (403, 404, 409...): se marcan `failed` y además
 *   se listan en `permanentFailures` para que la UI los muestre — de lo
 *   contrario quedarían encolados fallando en silencio para siempre.
 * - Errores transitorios (red, 5xx, 408, 429): se marcan `failed`, que
 *   sigue siendo reintentable (`getPending` incluye 'pending' y 'failed').
 */
export async function syncAll(executor) {
  const pending = getPending()
  const results = { synced: 0, failed: 0, pending: 0, permanentFailures: [] }

  for (const op of pending) {
    try {
      const response = await executor(op)
      markSynced(op.id, response)
      results.synced++
    } catch (err) {
      if (err?.status === 401) {
        results.pending++
        continue
      }
      markFailed(op.id, err?.message || 'Error de sincronización')
      results.failed++
      const isPermanent4xx = err?.status >= 400 && err.status < 500 && err.status !== 408 && err.status !== 429
      if (isPermanent4xx) results.permanentFailures.push({ op, status: err.status, message: err.message })
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
