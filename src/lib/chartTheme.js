// =====================================================
// PyroVenta — Tokens de visualización de datos
// Fuente única: la importan tailwind.config.js (clases bg-pay-*, text-pay-*)
// y los gráficos de Recharts. Solo valores planos, sin React.
// =====================================================

/**
 * Identidad de los métodos de pago en toda la app: verde = efectivo,
 * azul = transferencia, rosa = datáfono.
 *
 * Validados con validate_palette.js (skill de dataviz) sobre la superficie de
 * los paneles (#1a1a1a), comparando todos los pares: separación con
 * daltonismo ΔE ≥ 14.4, visión normal ≥ 15 y contraste ≥ 3:1. El violeta que
 * se usaba antes para datáfono quedaba a ΔE 1.3 del azul con deuteranopía:
 * transferencia y datáfono se veían iguales en la dona y en las barras.
 */
export const PAY_COLORS = {
  cash:     '#15803d', // green-700
  transfer: '#3b82f6', // blue-500
  card:     '#ec4899', // pink-500
}

export const PAY_LABELS = {
  cash:     'Efectivo',
  transfer: 'Transferencia',
  card:     'Datáfono',
}

/** Orden fijo de apilado y de leyenda (nunca por ranking). */
export const PAY_KEYS = ['cash', 'transfer', 'card']

export const CHART = {
  brand:   '#fb923c', // brand-400: serie principal (ventas)
  grid:    '#2a2a2a', // grilla: línea fina, un paso sobre la superficie
  axis:    '#9ca3af', // gray-400: texto de ejes (6.8:1 sobre la superficie)
  label:   '#e5e7eb', // gray-200: cifras rotuladas en las marcas
  labelStrong: '#d1d5db', // gray-300: nombres de categoría en el eje
  muted:   '#4b5563', // gray-600: marcas en segundo plano (énfasis)
  trend:   '#6b7280', // gray-500: sparklines y línea de promedio
  surface: '#1a1a1a', // surface-300: fondo de los paneles (separaciones y anillos)
  other:   '#5b5b5b', // "Otros" en rankings de categorías
}

/**
 * Tema claro de alto contraste (paneles blancos). Mismos roles, otros pasos:
 * marcas ≥3:1 y texto ≥7:1 sobre #ffffff. PAY_COLORS no cambia: validada
 * también sobre blanco (contraste ≥3:1, daltonismo ΔE ≥ 14.4).
 */
export const CHART_LIGHT = {
  brand:   '#ea580c', // brand-600: 3.6:1 (brand-400 daba 2.2:1 sobre blanco)
  grid:    '#e4e4e7',
  axis:    '#374151', // gray-700: 10.3:1
  label:   '#111827',
  labelStrong: '#1f2937',
  muted:   '#a1a1aa',
  trend:   '#6b7280',
  surface: '#ffffff',
  other:   '#9ca3af',
}

export const CHART_THEMES = { dark: CHART, light: CHART_LIGHT }

/** Texto de ejes: 11px (piso tipográfico), cifras monoespaciadas alineadas. */
export const axisTick = (tokens = CHART) => ({
  fill: tokens.axis,
  fontSize: 11,
  fontFamily: '"DM Mono", ui-monospace, monospace',
})
export const AXIS_TICK = axisTick(CHART)

/** Grosor máximo de barras: nunca llenar la banda, el resto es aire. */
export const MAX_BAR = 24
