// =====================================================
// VENDRA POS — Actualización automática en todos los equipos
// -----------------------------------------------------
// El navegador solo busca un service worker nuevo al navegar, y una caja
// abierta todo el día nunca navega: seguía con la versión vieja hasta que
// alguien recargara a mano. Aquí:
//   1. Se busca una versión nueva cada minuto, al volver a la pestaña y al
//      recuperar la conexión.
//   2. El service worker nuevo se activa apenas se instala (autoUpdate en
//      vite.config.js) y toma el control de todas las pestañas del equipo;
//      cada pantalla recarga sola en el primer momento seguro: sin
//      guardados en curso, sin diálogos abiertos, sin un campo a medio
//      escribir, y con la pestaña oculta o el equipo quieto 30 s. El carrito
//      (pv_cart), las ventas en pausa y la cola offline están en
//      localStorage: recargar no pierde nada.
//   3. Todas las pestañas del equipo se enteran por controllerchange y
//      recargan cada una en su momento seguro.
// Solo en producción: en desarrollo no hay service worker.
// =====================================================
import { pendingWrites } from './api.js'

export const CHECK_EVERY_MS = 60_000
export const IDLE_BEFORE_RELOAD_MS = 30_000
const SAFE_POLL_MS = 5_000

/**
 * ¿Se puede recargar ya sin interrumpir a nadie? Función pura (probada).
 * @param {{ writes: number, dialogOpen: boolean, editing: boolean, hidden: boolean, idleMs: number }} s
 */
export function isSafeToReload({ writes, dialogOpen, editing, hidden, idleMs }) {
  if (writes > 0 || dialogOpen || editing) return false
  return hidden || idleMs >= IDLE_BEFORE_RELOAD_MS
}

// ---- Estado observable (para el aviso en pantalla) ----
let ready = false
const listeners = new Set()
export const isUpdateReady = () => ready
export function subscribeUpdate(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

let applyNow = () => window.location.reload()
/** "Actualizar ahora": espera solo a que terminen los guardados en curso. */
export function applyUpdate() {
  const go = () => (pendingWrites() > 0 ? setTimeout(go, 500) : applyNow())
  go()
}

// Un campo con texto enfocado: recargar borraría lo que se está escribiendo
function editingField() {
  const el = document.activeElement
  if (!el?.matches?.('input, textarea, select, [contenteditable="true"]')) return false
  return 'value' in el ? String(el.value).length > 0 : true
}

export function startAppUpdates() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return

  let lastActivity = Date.now()
  const touch = () => { lastActivity = Date.now() }
  for (const ev of ['pointerdown', 'keydown', 'input', 'wheel']) {
    window.addEventListener(ev, touch, { capture: true, passive: true })
  }

  let reloading = false
  const reload = () => {
    if (reloading) return
    reloading = true
    window.location.reload()
  }

  // Un chunk diferido de la versión anterior ya no existe en el servidor
  // (deploy nuevo): la pantalla no puede cargar, solo queda recargar.
  window.addEventListener('vite:preloadError', (e) => {
    e.preventDefault()
    reload()
  })

  import('workbox-window').then(({ Workbox }) => {
    const wb = new Workbox('/sw.js', { scope: '/' })
    const sw = navigator.serviceWorker
    // ¿Ya había un SW controlando? Se actualiza en cada cambio: en la primera
    // visita el primer controllerchange es la instalación (clientsClaim), no
    // una versión nueva; los siguientes sí lo son.
    let controlled = Boolean(sw.controller)
    let registration = null
    let applying = false
    let safeTimer = null

    // Activa el service worker si quedó en espera (o recarga si ya controla la página)
    applyNow = () => {
      if (registration?.waiting) {
        applying = true
        wb.messageSkipWaiting() // → controllerchange → reload()
      } else {
        reload()
      }
    }

    const tryApply = () => {
      const safe = isSafeToReload({
        writes: pendingWrites(),
        dialogOpen: Boolean(document.querySelector('[role="dialog"], [role="alertdialog"]')),
        editing: editingField(),
        hidden: document.visibilityState === 'hidden',
        idleMs: Date.now() - lastActivity,
      })
      if (safe) applyNow()
    }

    const markReady = () => {
      if (!ready) {
        ready = true
        listeners.forEach(fn => fn())
      }
      if (!safeTimer) safeTimer = setInterval(tryApply, SAFE_POLL_MS)
      tryApply()
    }

    // Versión nueva instalada pero en espera (p. ej. un SW anterior sin
    // skipWaiting): se activa al aplicar la actualización
    wb.addEventListener('waiting', markReady)

    // El SW nuevo tomó el control: esta pantalla corre el código viejo y debe
    // recargar en su momento seguro (ya, si la recarga la pidió ella misma).
    // Sin controlador previo es la primera instalación: no hay nada que recargar.
    sw.addEventListener('controllerchange', () => {
      if (applying) reload()
      else if (controlled) markReady()
      controlled = true
    })

    const check = () => {
      if (!registration || registration.installing || !navigator.onLine) return
      registration.update().catch(() => { /* sin red o servidor caído: el próximo intento */ })
    }

    wb.register().then((r) => {
      registration = r || null
      if (registration?.waiting && sw.controller) markReady()
      setInterval(check, CHECK_EVERY_MS)
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check()
        else if (ready) tryApply()
      })
      window.addEventListener('online', check)
    }).catch(() => { /* navegador sin SW (o bloqueado): la app funciona igual */ })
  }).catch(() => {})
}
