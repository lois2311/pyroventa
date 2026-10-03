// Lógica pura de la pantalla de Inventario (reposición, merma y bitácora).
// Sin React: se prueba aparte y la comparten el listado, el panel de recepción y la bitácora.
import { getStockStatus, stockQty } from './stockStatus.js'

/** Orden de la cola "Por reponer": sin existencia, stock bajo, disponible y al final lo no controlado. */
const URGENCY = { out_of_stock: 0, low_stock: 1, in_stock: 2, untracked: 3 }

export const needsRestock = (item) => ['out_of_stock', 'low_stock'].includes(getStockStatus(item))

/** Agotados y con stock bajo primero (los de menor saldo arriba); luego por nombre. No muta la entrada. */
export function sortByUrgency(items) {
  return [...items].sort((a, b) => {
    const ra = URGENCY[getStockStatus(a)]
    const rb = URGENCY[getStockStatus(b)]
    if (ra !== rb) return ra - rb
    if (ra <= 1 && stockQty(a) !== stockQty(b)) return stockQty(a) - stockQty(b)
    return String(a.name).localeCompare(String(b.name), 'es')
  })
}

/** Cantidad escrita → entero > 0, o null si no sirve. */
export function parseQty(value) {
  const n = Number(value)
  return value !== '' && value !== null && Number.isInteger(n) && n > 0 ? n : null
}

/** Vista previa "actual → nuevo saldo". delta: +N (reposición) o −N (merma). */
export function previewBalance(current, qty, sign = 1) {
  const n = parseQty(qty)
  if (n === null) return { valid: false, next: Number(current) || 0 }
  return { valid: true, next: (Number(current) || 0) + sign * n }
}

export const REASON_LABELS = {
  sale: 'Venta',
  refund: 'Devolución',
  manual_adjustment: 'Conteo / ajuste',
  initial_load: 'Carga inicial',
  bulk_upload: 'Carga masiva',
  restock: 'Reposición',
  damage: 'Merma',
  transfer: 'Traslado',
}

export const ROLE_LABELS_SHORT = { owner: 'Superadmin', admin: 'Admin', cashier: 'Cajero', seller: 'Vendedor' }

/** Tono de una fila de la bitácora: salida resaltada (error), reposición (marca) o neutro. */
export function movementTone(m) {
  if (m.flag === 'outflow') return 'outflow'
  if (m.reason === 'restock') return 'restock'
  return 'neutral'
}

/** Filas para exportar a Excel, con las mismas columnas que se ven en pantalla. */
export function movementsToRows(movements) {
  return movements.map(m => ({
    'Fecha': new Date(m.created_at).toLocaleString('es-CO'),
    'Punto': m.location_name ?? '',
    'Producto': m.product_name ?? '',
    'Usuario': m.user_name ?? '',
    'Rol': ROLE_LABELS_SHORT[m.user_role] ?? m.user_role ?? '',
    'Motivo': REASON_LABELS[m.reason] ?? m.reason,
    'Stock antes': m.stock_before ?? '',
    'Variación': Number(m.delta),
    'Stock después': Number(m.final_stock),
    'Referencia': m.reference ?? '',
    'Notas': m.notes ?? '',
    'Salida': m.flag === 'outflow' ? 'Sí' : '',
  }))
}

/** Cuerpo de POST /inventory/receive a partir de las líneas del panel. */
export function buildReceivePayload(locationId, lines, reference, notes) {
  return {
    location_id: locationId,
    ...(reference?.trim() ? { reference: reference.trim() } : {}),
    ...(notes?.trim() ? { notes: notes.trim() } : {}),
    items: lines.map(l => ({ product_id: l.productId, quantity: parseQty(l.quantity) })),
  }
}
