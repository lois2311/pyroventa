// =====================================================
// VENDRA POS — Tokens de visualización de datos
// Fuente única: la importan tailwind.config.js (clases bg-pay-*, text-pay-*)
// y los gráficos de Recharts. Solo valores planos, sin React.
// =====================================================

/**
 * Identidad de los métodos de pago en toda la app: verde = efectivo,
 * azul = transferencia, rosa = datáfono.
 *
 * Validados con validate_palette.js (skill de dataviz) sobre la superficie de
 * los paneles, comparando todos los pares: separación con
 * daltonismo ΔE ≥ 14.4, visión normal ≥ 15 y contraste ≥ 3:1. El violeta que
 * se usaba antes para datáfono quedaba a ΔE 1.3 del azul con deuteranopía:
 * transferencia y datáfono se veían iguales en la dona y en las barras.
 */
export const PAY_COLORS = {
  cash:     '#15803d', // green-700
  transfer: '#2F8CFF', // Azul Cielo (VENDRA)
  card:     '#ec4899', // pink-500
}

export const PAY_LABELS = {
  cash:     'Efectivo',
  transfer: 'Transferencia',
  card:     'Datáfono',
}

/** Orden fijo de apilado y de leyenda (nunca por ranking). */
export const PAY_KEYS = ['cash', 'transfer', 'card']

// Paleta de marca para gráficos (VENDRA). Los estados (Atención, Error) se
// exportan aparte y se reservan para estado: nunca pintan una categoría.
export const CHART = {
  brand:   '#B4E854', // Voltaje: serie principal y valor destacado (pico, último punto)
  bar:     '#7FB52E', // Voltaje Profundo: barras (6.4:1 sobre la Superficie)
  info:    '#2F8CFF', // Azul Cielo
  warn:    '#FFB547', // Atención
  error:   '#FF7A66', // Error
  grid:    '#1E3A5F', // grilla: línea fina, un paso sobre la Superficie
  axis:    '#98A6C0', // gray-400: texto de ejes (6.3:1 sobre la Superficie)
  label:   '#DCE3EE', // gray-200: cifras rotuladas en las marcas
  labelStrong: '#C0CADB', // gray-300: nombres de categoría en el eje
  muted:   '#45526E', // gray-600: marcas en segundo plano (énfasis)
  trend:   '#586686', // Pista: sparklines y línea de promedio
  surface: '#10243F', // Superficie: fondo de los paneles (separaciones y anillos)
  other:   '#33405A', // "Otros" en rankings de categorías
}

/**
 * Tema claro de alto contraste (paneles blancos). Mismos roles, otros pasos:
 * marcas ≥3:1 y texto ≥7:1 sobre #ffffff. PAY_COLORS no cambia: validada
 * también sobre blanco (contraste ≥3:1, daltonismo ΔE ≥ 14.4).
 */
export const CHART_LIGHT = {
  brand:   '#3F6B0F', // --vd-ok-ink: 6.3:1 (Voltaje da 1.6:1 sobre blanco)
  bar:     '#5F8A21', // Voltaje Profundo oscurecido: 4.1:1 (el original da 2.3:1)
  info:    '#1C63C4', // Azul Cielo oscurecido (--vd-link claro): 5.8:1
  warn:    '#8A5200', // --vd-warn-ink
  error:   '#B02A1C', // --vd-error-ink
  grid:    '#E3E9F1',
  axis:    '#586686', // Pista: 5.7:1
  label:   '#0D2348', // Azul Vuelo
  labelStrong: '#13294F',
  muted:   '#97A2B8',
  trend:   '#6B7894',
  surface: '#ffffff',
  other:   '#97A2B8',
}

export const CHART_THEMES = { dark: CHART, light: CHART_LIGHT }

/** Texto de ejes: 11px (piso tipográfico), cifras monoespaciadas alineadas. */
export const axisTick = (tokens = CHART) => ({
  fill: tokens.axis,
  fontSize: 11,
  fontFamily: '"JetBrains Mono", Consolas, ui-monospace, monospace',
})
export const AXIS_TICK = axisTick(CHART)

/** Grosor máximo de barras: nunca llenar la banda, el resto es aire. */
export const MAX_BAR = 24
