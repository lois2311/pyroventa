// Billetes colombianos con los que suele pagarse: sugerir "con cuánto paga"
// ahorra teclear el monto en cada cobro en efectivo.
const BILL_STEPS = [5000, 10000, 20000, 50000, 100000]

/**
 * Montos de pago en efectivo probables para un total: el siguiente múltiplo
 * de cada billete, sin repetir, de menor a mayor. No incluye el total exacto
 * (la UI lo ofrece aparte como "Exacto").
 *
 *   suggestCashAmounts(78526) → [80000, 100000]
 *   suggestCashAmounts(3000)  → [5000, 10000, 20000]
 */
export function suggestCashAmounts(total, max = 3) {
  const t = Math.round(Number(total) || 0)
  if (t <= 0) return []
  const out = new Set()
  for (const step of BILL_STEPS) {
    const v = Math.ceil(t / step) * step
    if (v > t) out.add(v)
  }
  return [...out].sort((a, b) => a - b).slice(0, max)
}
