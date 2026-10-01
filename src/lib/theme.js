// =====================================================================
// Tema de la interfaz: 'dark' (por defecto en caja) o 'light' (oficina,
// reportes, stands con mucha luz). El atributo <html data-theme> lo fija un
// script en index.html ANTES de pintar; aquí se cambia, se guarda y se
// expone a React. La clave pv_theme se conserva para no perder la
// preferencia de los equipos ya instalados.
// =====================================================================
import { useSyncExternalStore } from 'react'

export const THEME_KEY = 'pv_theme'
// Color de la barra del navegador / PWA: Noche y Nube
const THEME_COLOR = { dark: '#0A1428', light: '#F6F8FB' }

export function getTheme() {
  if (typeof document === 'undefined') return 'dark'
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark'
}

const listeners = new Set()

export function setTheme(theme) {
  const next = theme === 'light' ? 'light' : 'dark'
  document.documentElement.dataset.theme = next
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[next])
  try { localStorage.setItem(THEME_KEY, next) } catch { /* modo privado: solo esta sesión */ }
  listeners.forEach(fn => fn())
}

export function toggleTheme() {
  setTheme(getTheme() === 'light' ? 'dark' : 'light')
}

function subscribe(fn) {
  listeners.add(fn)
  const onStorage = (e) => { if (e.key === THEME_KEY && e.newValue) setTheme(e.newValue) }
  window.addEventListener('storage', onStorage)
  return () => { listeners.delete(fn); window.removeEventListener('storage', onStorage) }
}

/** Tema actual; re-renderiza al cambiarlo (gráficos, íconos del botón). */
export function useTheme() {
  return useSyncExternalStore(subscribe, getTheme, () => 'dark')
}
