// Búsqueda de texto tolerante: sin tildes, sin mayúsculas y por palabras.
// "volcan mag" encuentra "Volcán mágico"; el orden de las palabras no importa.

/** Minúsculas y sin diacríticos (á→a, ñ→n). */
export function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
}

/** true si TODAS las palabras de `query` aparecen en alguno de los textos. */
export function matchesQuery(texts, query) {
  const words = normalizeText(query).split(/\s+/).filter(Boolean)
  if (!words.length) return true
  const haystack = texts.map(normalizeText).join(' ')
  return words.every(w => haystack.includes(w))
}
