// Ventas en pausa (F8): el ticket en curso se guarda en este equipo para
// atender a otro cliente y retomarlo después. Solo vive en localStorage (por
// punto de venta): no se manda al servidor ni cambia ningún contrato de datos.

const MAX_PARKED = 5
const keyFor = (locationId) => `vd_parked_${locationId || 'none'}`

export function loadParked(locationId) {
  try {
    const list = JSON.parse(localStorage.getItem(keyFor(locationId)) || '[]')
    return Array.isArray(list) ? list.filter(p => Array.isArray(p?.items) && p.items.length) : []
  } catch {
    return []
  }
}

function save(locationId, list) {
  try {
    localStorage.setItem(keyFor(locationId), JSON.stringify(list))
  } catch {
    // Sin almacenamiento (modo privado lleno): la pausa simplemente no persiste
  }
  return list
}

/** Guarda un ticket; el más reciente primero. Devuelve la lista nueva. */
export function parkSale(locationId, items, now = Date.now()) {
  const entry = { id: `${now}-${Math.random().toString(36).slice(2, 7)}`, parkedAt: now, items }
  return save(locationId, [entry, ...loadParked(locationId)].slice(0, MAX_PARKED))
}

/** Quita un ticket en pausa y lo devuelve junto con la lista restante. */
export function takeParked(locationId, id) {
  const list = loadParked(locationId)
  const entry = list.find(p => p.id === id) || null
  return { entry, list: save(locationId, list.filter(p => p.id !== id)) }
}

export function parkedTotal(entry) {
  return entry.items.reduce((sum, i) => sum + (Number(i.subtotal) || 0), 0)
}

export function parkedCount(entry) {
  return entry.items.reduce((n, i) => n + (Number(i.qty) || 0), 0)
}
