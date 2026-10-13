// =====================================================
// Vendra Pedidos — reglas de la entrega (puras, sin BD).
// La entrega es logística: separada del estado comercial del pedido y del pago.
// Crear la entrega a un pedido `accepted` es la autorización de despacho.
// =====================================================

export const DELIVERY_STATUSES = ['ready_for_dispatch', 'assigned', 'picked_up', 'delivered', 'delivery_failed']
export const ACTIVE_STATUSES = ['ready_for_dispatch', 'assigned', 'picked_up']
export const FINISHED_STATUSES = ['delivered', 'delivery_failed']
/** Estados que el domiciliario/operador puede fijar con POST .../status (asignar se hace al crear la entrega). */
export const SETTABLE_STATUSES = ['picked_up', 'delivered', 'delivery_failed']

const TRANSITIONS = {
  ready_for_dispatch: [],                              // se sale de aquí asignando, no con este endpoint
  assigned:           ['picked_up', 'delivery_failed'],
  picked_up:          ['delivered', 'delivery_failed'], // no se entrega lo que no se recogió
  delivered:          [],
  delivery_failed:    [],                              // reintentar = crear una entrega nueva
}

export const canDeliveryTransition = (from, to) => !!TRANSITIONS[from]?.includes(to)

/** Dirección en una línea para el domiciliario y el enlace de mapas. */
export function addressLine(delivery) {
  if (!delivery?.address) return null
  const { address, details, reference_notes } = delivery
  return [address, details, reference_notes && `Ref.: ${reference_notes}`].filter(Boolean).join(' · ')
}

/** Efectivo que el domiciliario debe cobrar: solo contraentrega; transferencias ya están pagadas/verificadas. */
export const amountToCollect = (payment, total) => (payment?.method === 'cash_on_delivery' ? Number(total) || 0 : 0)

/** Hora de inicio del día en Bogotá (UTC-5 todo el año, sin horario de verano), como ISO. */
export function bogotaDayStart(now = new Date()) {
  const day = now.toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
  return new Date(`${day}T00:00:00-05:00`).toISOString()
}

export const shortCode = (id) => String(id || '').slice(0, 8).toUpperCase()
