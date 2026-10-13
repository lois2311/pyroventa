// =====================================================
// Espera entre reintentos del outbox: exponencial con "equal jitter".
//   techo = min(max, base * 2^(intento-1));  espera ∈ [techo/2, techo]
// El jitter evita que muchos eventos fallidos a la vez reintenten en bloque
// contra un proveedor que apenas se recupera; la mitad fija garantiza espacio real.
// =====================================================

export const BASE_DELAY_MS = 30_000          // 30 s tras el primer fallo
export const MAX_DELAY_MS  = 60 * 60_000     // tope: 1 h

/** @param {number} attempts intentos ya realizados (≥ 1) */
export function backoffDelayMs(attempts, { base = BASE_DELAY_MS, max = MAX_DELAY_MS, random = Math.random } = {}) {
  const ceiling = Math.min(max, base * 2 ** Math.max(0, attempts - 1))
  return Math.round(ceiling / 2 + random() * (ceiling / 2))
}
