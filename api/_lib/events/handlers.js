// =====================================================
// Registro de handlers del outbox: event_type → async (row) => void.
// Vacío a propósito: los eventos de pedido se encolan desde PR-05, pero su envío
// (WhatsApp) llega con el adaptador del proveedor (PR-06). Mientras un tipo no
// tenga handler, sus filas esperan en 'pending' (el worker no las toca).
// Un handler debe ser idempotente (usar row.id ante el proveedor) y lanzar
// PermanentError cuando reintentar no ayude.
// =====================================================
export const handlers = {}
