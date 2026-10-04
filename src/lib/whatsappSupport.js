// =====================================================
// VENDRA POS — Utilidades de enlace a WhatsApp para Soporte
// =====================================================

export const DEFAULT_FLIGHTDEV_SUPPORT_PHONE = '573000000000'

/**
 * Normaliza cualquier número para formato internacional WhatsApp (+57...).
 * Si ya tiene prefijo internacional o 57, lo respeta; si es celular colombiano de 10 dígitos (3xx), antepone 57.
 */
export function normalizeWhatsAppNumber(phone) {
  if (!phone) return DEFAULT_FLIGHTDEV_SUPPORT_PHONE
  const digits = String(phone).replace(/[^\d]/g, '')
  if (digits.startsWith('57') && digits.length >= 12) return digits
  if (digits.length === 10 && digits.startsWith('3')) return `57${digits}`
  if (digits.length > 8) return digits
  return DEFAULT_FLIGHTDEV_SUPPORT_PHONE
}

/**
 * Compone el texto estructurado del mensaje inicial para la conversación de soporte.
 */
export function formatTicketMessage({
  ticketCode,
  tenantName,
  categoryLabel,
  locationName,
  customText,
}) {
  const lines = [
    `*TICKET DE SOPORTE VENDRA: ${ticketCode}*`,
    `Empresa: ${tenantName || 'No especificada'}`,
    locationName ? `Punto: ${locationName}` : null,
    categoryLabel ? `Categoría: ${categoryLabel}` : null,
    customText ? `Detalle: ${customText}` : null,
    '',
    '_Hola equipo de Soporte VENDRA, solicito asistencia con esta incidencia._',
  ].filter(line => line !== null)

  return lines.join('\n')
}

/**
 * Genera el enlace oficial https://wa.me/ con mensaje prellenado codificado.
 */
export function buildWhatsAppSupportUrl({
  supportPhone,
  ticketCode,
  tenantName,
  categoryLabel,
  locationName,
  customText,
}) {
  const phone = normalizeWhatsAppNumber(supportPhone)
  const message = formatTicketMessage({
    ticketCode,
    tenantName,
    categoryLabel,
    locationName,
    customText,
  })

  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`
}
