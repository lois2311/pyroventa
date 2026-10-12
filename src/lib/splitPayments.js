// Pago mixto: el cliente reparte el total entre efectivo, transferencia y datáfono.
// Todo es aritmética pura (testeable); la UI solo pinta lo que devuelve evaluateSplit.

export const SPLIT_METHODS = ['cash', 'transfer', 'card']
export const EMPTY_SPLIT = { cash: '', transfer: '', card: '' }

const num = (v) => {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : 0
}

/**
 * @param total     total a cobrar (con descuento)
 * @param amounts   { cash, transfer, card } como los escribió el cajero (strings)
 * @param provider  nequi | daviplata | bancolombia (obligatorio si hay transferencia)
 *
 * Reglas: la suma debe cubrir el total; el vuelto solo sale del efectivo, así
 * que un sobrante mayor al efectivo recibido no es válido.
 *
 * Devuelve:
 *   remaining  lo que falta (0 si ya alcanza)
 *   change     vuelto a devolver en efectivo
 *   payments   montos NETOS (el efectivo ya sin el vuelto): suman exactamente el total
 *   error      null | 'short' | 'overpaid' | 'provider'
 *   ok         se puede cobrar
 */
export function evaluateSplit(total, amounts, provider) {
  const a = Object.fromEntries(SPLIT_METHODS.map(m => [m, num(amounts?.[m])]))
  const paid = a.cash + a.transfer + a.card
  const remaining = Math.max(0, total - paid)
  const change = Math.max(0, paid - total)

  const net = { ...a, cash: a.cash - Math.min(change, a.cash) }
  const payments = SPLIT_METHODS
    .filter(m => net[m] > 0)
    .map(m => ({
      method: m,
      amount: net[m],
      ...(m === 'transfer' && provider ? { transfer_provider: provider } : {}),
    }))

  let error = null
  if (remaining > 0 || paid === 0) error = 'short'
  else if (change > a.cash) error = 'overpaid'
  else if (a.transfer > 0 && !provider) error = 'provider'

  return { paid, remaining, change, payments, error, ok: error === null && payments.length > 0 }
}

/**
 * Cuerpo del cobro. `pay_method` sigue siendo un solo método (el de mayor
 * monto) para el API actual; `payments` lleva el desglose completo.
 * transfer_provider va dentro de cada pago: el API solo lo acepta en la raíz
 * cuando pay_method es 'transfer'.
 */
export function splitPayBody(split) {
  const primary = split.payments.reduce((best, p) => (p.amount > best.amount ? p : best))
  return {
    pay_method: primary.method,
    payments: split.payments,
    ...(primary.method === 'transfer' ? { transfer_provider: primary.transfer_provider } : {}),
  }
}
