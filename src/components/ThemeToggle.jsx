import { Moon, Sun } from 'lucide-react'
import { toggleTheme, useTheme } from '../lib/theme.js'

/**
 * Alterna entre el tema oscuro y el claro de alto contraste (para stands al
 * aire libre). Botón de alternancia: etiqueta fija + aria-pressed, así el
 * lector de pantalla anuncia "Tema claro, activado/desactivado".
 */
export default function ThemeToggle({ className = '' }) {
  const light = useTheme() === 'light'
  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-pressed={light}
      aria-label="Tema claro de alto contraste"
      title={light ? 'Cambiar a tema oscuro' : 'Cambiar a tema claro (alto contraste)'}
      className={`btn btn-ghost btn-icon text-gray-400 hover:text-white ${className}`}
    >
      {light ? <Moon className="h-4 w-4" aria-hidden="true" /> : <Sun className="h-4 w-4" aria-hidden="true" />}
    </button>
  )
}
