// =====================================================
// PyroVenta — Utilidades de formato
// =====================================================

/**
 * Formatea un número como precio en pesos colombianos.
 * Ejemplo: 25000 → "$25.000"
 */
export function formatCOP(amount) {
  if (amount == null || isNaN(amount)) return '$0'
  const formatted = new Intl.NumberFormat('es-CO', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Math.round(amount))
  // es-CO usa punto como separador de miles
  return '$' + formatted
}

/**
 * Formatea fecha en español colombiano.
 * Ejemplo: "15/12/2024  14:32"
 */
export function formatDate(dateString) {
  if (!dateString) return ''
  const date = new Date(dateString)
  return date.toLocaleString('es-CO', {
    day:    '2-digit',
    month:  '2-digit',
    year:   'numeric',
    hour:   '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

/**
 * Formatea fecha corta.
 * Ejemplo: "15/12/2024"
 */
export function formatDateShort(dateString) {
  if (!dateString) return ''
  const date = new Date(dateString)
  return date.toLocaleDateString('es-CO', {
    day:   '2-digit',
    month: '2-digit',
    year:  'numeric',
  })
}

/**
 * Agrega espaciado visual entre dígitos de un código.
 * Ejemplo: "7431" → "7  4  3  1"
 */
export function formatCode(code) {
  if (!code) return ''
  return String(code).split('').join('  ')
}

/**
 * Retorna tiempo transcurrido en español.
 * Ejemplo: "hace 3 min", "hace 1 h"
 */
export function timeAgo(dateString) {
  if (!dateString) return ''
  const diff = Date.now() - new Date(dateString).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1)  return 'hace un momento'
  if (minutes < 60) return `hace ${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `hace ${hours} h`
  const days = Math.floor(hours / 24)
  return `hace ${days} día${days > 1 ? 's' : ''}`
}

/**
 * Clasifica el estado de urgencia de una factura según su antigüedad.
 * @returns {'fresh'|'warning'|'urgent'}
 */
export function invoiceUrgency(createdAt) {
  const minutes = (Date.now() - new Date(createdAt).getTime()) / 60000
  if (minutes < 5)  return 'fresh'
  if (minutes < 15) return 'warning'
  return 'urgent'
}

/**
 * Mapea método de pago a etiqueta en español.
 */
export function payMethodLabel(method) {
  const labels = { cash: 'Efectivo', transfer: 'Transferencia', card: 'Datáfono' }
  return labels[method] || method || '—'
}

/**
 * Mapea estado de factura a etiqueta en español.
 */
export function statusLabel(status) {
  const labels = { pending: 'Pendiente', paid: 'Pagada', cancelled: 'Cancelada' }
  return labels[status] || status || '—'
}
