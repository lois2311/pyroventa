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

  const valida = (s) => {
    const d = new Date(`${s}T00:00:00Z`)
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s
  }
  if (!valida(f) || !valida(t)) throw badRequest('Fechas inválidas — usa formato YYYY-MM-DD')

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

/**
 * Periodo inmediatamente anterior, de la misma duración — para comparar
 * "esta semana vs la pasada" en los KPIs del dashboard. Ej: from=to=hoy
 * (1 día) → el día anterior; from/to de 7 días → los 7 días previos a esos.
 */
export function previousPeriod(from, to) {
  const fromD = new Date(`${from}T00:00:00Z`)
  const toD   = new Date(`${to}T00:00:00Z`)
  const days  = Math.round((toD - fromD) / 86400000) + 1

  const prevTo = new Date(fromD)
  prevTo.setUTCDate(prevTo.getUTCDate() - 1)
  const prevFrom = new Date(prevTo)
  prevFrom.setUTCDate(prevFrom.getUTCDate() - (days - 1))

  const iso = (d) => d.toISOString().slice(0, 10)
  return { from: iso(prevFrom), to: iso(prevTo) }
}
