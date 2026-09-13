const COLOR_CLASSES = {
  brand:   'bg-gradient-to-r from-brand-600 to-brand-400',
  green:   'bg-green-500',
  blue:    'bg-blue-500',
  violet:  'bg-violet-500',
  neutral: 'bg-gray-600',
}

const HEIGHT_CLASSES = {
  xs: 'h-1',
  sm: 'h-1.5',
  md: 'h-2',
}

/**
 * Barra de magnitud reutilizada por todos los indicadores (tendencia diaria,
 * comparación de puntos/cajas/vendedores, top productos, desglose de pago).
 * `pct` ya viene calculado por el llamador (valor / máximo del set).
 */
export default function ProgressBar({ pct, color = 'brand', height = 'sm' }) {
  const clamped = Math.max(0, Math.min(100, pct || 0))
  return (
    <div className={`${HEIGHT_CLASSES[height]} bg-surface-50 rounded-full overflow-hidden`}>
      <div
        className={`h-full rounded-full transition-all duration-700 ${COLOR_CLASSES[color] || COLOR_CLASSES.brand}`}
        style={{ width: `${clamped}%` }}
      />
    </div>
  )
}
