import { bogotaDate } from './tenantStatus.js'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function badRequest(message) {
  const err = new Error(message)
  err.status = 400
  return err
}

/**
 * Resuelve el rango de fechas de un reporte desde req.query.
 * Acepta from/to (inclusivos), date (retrocompatibilidad) o nada (hoy Bogotá).
 */
export function parseRange(query = {}) {
  const { from, to, date } = query
  let f, t
  if (from || to) { f = from || to; t = to || from }
  else if (date)  { f = date; t = date }
  else            { f = bogotaDate(); t = f }

  if (!DATE_RE.test(f) || !DATE_RE.test(t)) throw badRequest('Fechas inválidas — usa formato YYYY-MM-DD')
  if (t < f) throw badRequest('El rango es inválido: "hasta" es anterior a "desde"')
  return { from: f, to: t }
}

/**
 * Límites timestamptz de un rango de días Bogotá (-05:00, sin DST):
 * start = 00:00 Bogotá de `from`; end (exclusivo) = 00:00 Bogotá del día siguiente a `to`.
 */
export function bogotaDayBounds(from, to) {
  const start = new Date(`${from}T00:00:00-05:00`)
  const end   = new Date(`${to}T00:00:00-05:00`)
  end.setUTCDate(end.getUTCDate() + 1)
  return { start: start.toISOString(), end: end.toISOString() }
}
