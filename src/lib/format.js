// =====================================================
// VENDRA POS — Utilidades de formato
// =====================================================

/**
 * Formatea un número como precio en pesos colombianos.
 * Ejemplo: 25000 → "$25.000"
 */
export function formatCOP(amount) {
  if (amount == null || isNaN(amount)) return '$0'
  const rounded = Math.round(amount)
  const formatted = new Intl.NumberFormat('es-CO', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Math.abs(rounded))
  // es-CO usa punto como separador de miles. El signo va antes del símbolo:
  // "-$5.000", no "$-5.000" (diferencias de cierre, ajustes de auditoría).
  return (rounded < 0 ? '-' : '') + '$' + formatted
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

const MONTHS_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const WEEKDAYS_SHORT = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']

/**
 * Día de una fecha ISO (YYYY-MM-DD) en formato corto colombiano, sin pasar
 * por Date (así no se corre un día por zona horaria).
 * Ejemplo: "2026-09-23" → "23 sep"; con weekday → "mié 23 sep"
 */
export function formatDayShort(isoDay, { weekday = false } = {}) {
  if (!isoDay) return ''
  const [y, m, d] = String(isoDay).slice(0, 10).split('-').map(Number)
  if (!y || !m || !d) return String(isoDay)
  const base = `${d} ${MONTHS_SHORT[m - 1]}`
  if (!weekday) return base
  // Date.UTC + getUTCDay: el día de la semana del calendario, sin zona horaria
  return `${WEEKDAYS_SHORT[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ${base}`
}

/**
 * Rango de fechas ISO legible para encabezados.
 * Ejemplo: ("2026-09-22", "2026-09-28") → "22 sep – 28 sep 2026"
 *          ("2026-09-28", "2026-09-28") → "28 sep 2026"
 */
export function formatRangeLabel(from, to) {
  if (!from) return ''
  const yearOf = (iso) => String(iso).slice(0, 4)
  if (!to || from === to) return `${formatDayShort(from)} ${yearOf(from)}`
  const sameYear = yearOf(from) === yearOf(to)
  return `${formatDayShort(from)}${sameYear ? '' : ` ${yearOf(from)}`} – ${formatDayShort(to)} ${yearOf(to)}`
}

/**
 * Monto compacto para ejes y etiquetas angostas: $950, $40k, $1,2M.
 * formatCOP completo se reserva para tooltips y tablas, donde hay espacio.
 */
export function formatCOPShort(n) {
  const v = Number(n) || 0
  const abs = Math.abs(v)
  const sign = v < 0 ? '-' : ''
  const trim = (x) => x.toFixed(1).replace(/\.0$/, '').replace('.', ',')
  if (abs >= 1_000_000) return `${sign}$${trim(abs / 1_000_000)}M`
  if (abs >= 1_000) return `${sign}$${Math.round(abs / 1000)}k`
  return `${sign}$${Math.round(abs)}`
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
export function payMethodLabel(method, transferProvider) {
  const labels = { cash: 'Efectivo', transfer: 'Transferencia', card: 'Datáfono' }
  const base = labels[method] || method || '—'
  // Las transferencias llevan por dónde entró la plata: "Transferencia (Nequi)"
  if (method === 'transfer' && transferProvider) {
    return `${base} (${transferProviderLabel(transferProvider)})`
  }
  return base
}

/** Billeteras/bancos aceptados para transferencias. */
export const TRANSFER_PROVIDERS = [
  { id: 'nequi',       label: 'Nequi' },
  { id: 'daviplata',   label: 'Daviplata' },
  { id: 'bancolombia', label: 'Bancolombia' },
]

export function transferProviderLabel(provider) {
  return TRANSFER_PROVIDERS.find(p => p.id === provider)?.label || provider || '—'
}

/**
 * Mapea estado de factura a etiqueta en español.
 */
export function statusLabel(status) {
  const labels = { pending: 'Pendiente', paid: 'Pagada', cancelled: 'Cancelada' }
  return labels[status] || status || '—'
}
