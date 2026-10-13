import { ORDER_EVENTS } from './orderEvents.js'
import { sendOutboundMessage, orderNotification, deliveryNotification } from './whatsappHandlers.js'

// =====================================================
// Registro de handlers del outbox: event_type → async (row) => void.
// El worker solo toma tipos que tienen handler aquí; los demás esperan en 'pending'.
// Un handler debe ser idempotente y lanzar PermanentError cuando reintentar no ayude.
// =====================================================
const { deliveryStatusChanged, ...orderEvents } = ORDER_EVENTS

export const handlers = {
  'message.outbound': (row) => sendOutboundMessage(row),
  ...Object.fromEntries(Object.values(orderEvents).map(type => [type, (row) => orderNotification(type)(row)])),
  [deliveryStatusChanged]: (row) => deliveryNotification(row),
}
