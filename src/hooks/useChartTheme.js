import { useMemo } from 'react'
import { useTheme } from '../lib/theme.js'
import { CHART_THEMES, axisTick } from '../lib/chartTheme.js'

/**
 * Tokens de gráfico del tema activo. Recharts pinta con atributos SVG
 * (fill/stroke), que no leen las variables CSS del tema: se eligen en JS y
 * el gráfico se re-renderiza al cambiar de tema.
 */
export function useChartTheme() {
  const theme = useTheme()
  return useMemo(() => {
    const C = CHART_THEMES[theme] || CHART_THEMES.dark
    return { C, AXIS_TICK: axisTick(C) }
  }, [theme])
}
