// =====================================================
// PyroVenta — Cliente HTTP con retry, timeout y offline
// =====================================================

const BASE = '/api'
const REQUEST_TIMEOUT = 15000 // 15 segundos
const MAX_RETRIES = 2
const RETRY_DELAY = 1500 // ms base, se multiplica por intento

async function request(method, path, body, options = {}) {
  const { retries = MAX_RETRIES, timeout = REQUEST_TIMEOUT } = options
  const token = localStorage.getItem('pv_token')

  let lastError = null

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeout)

      const res = await fetch(`${BASE}${path}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        signal: controller.signal,
      })

      clearTimeout(timer)

      if (!res.ok) {
        let message = `Error HTTP ${res.status}`
        let code = null
        try {
          const data = await res.json()
          message = data.error || data.message || message
          code = data.code || null
        } catch { /* ignore parse errors */ }
        const err = new Error(message)
        err.status = res.status
        err.code = code
        // Sesión inválida o expirada → cerrar sesión y volver al login
        if (res.status === 401 && !path.startsWith('/auth/') && !path.startsWith('/public/')) {
          const { useAuthStore } = await import('../store/authStore.js')
          useAuthStore.getState().logout()
          window.location.href = '/login'
          throw err
        }
        // Licencia vencida / empresa suspendida → evento global para bloquear la app
        if (res.status === 403 && ['LICENSE_EXPIRED', 'TENANT_SUSPENDED', 'LICENSE_NOT_STARTED'].includes(code)) {
          window.dispatchEvent(new CustomEvent('pv:license-error', { detail: { code, message } }))
        }
        // No reintentar errores de cliente (4xx) excepto 408/429
        if (res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429) {
          throw err
        }
        lastError = err
      } else {
        if (res.status === 204) return null
        return await res.json()
      }
    } catch (err) {
      lastError = err
      if (err.name === 'AbortError') {
        lastError = new Error('Tiempo de espera agotado — verifica tu conexión')
        lastError.offline = true
      }
      // TypeError: Failed to fetch = sin red
      if (err instanceof TypeError && err.message.includes('fetch')) {
        lastError = new Error('Sin conexión a internet')
        lastError.offline = true
      }
    }

    // Esperar antes de reintentar (exponential backoff)
    if (attempt < retries) {
      await new Promise(r => setTimeout(r, RETRY_DELAY * (attempt + 1)))
    }
  }

  throw lastError
}

export const api = {
  get:    (path, opts)        => request('GET',    path, undefined, opts),
  post:   (path, body, opts)  => request('POST',   path, body, opts),
  put:    (path, body, opts)  => request('PUT',    path, body, opts),
  delete: (path, opts)        => request('DELETE', path, undefined, opts),
}

// ---- Caché de productos (TTL 1 hora, stale-while-revalidate) ----
const PRODUCT_CACHE_TTL    = 60 * 60 * 1000  // 1 hora fresh
const PRODUCT_CACHE_STALE  = 24 * 60 * 60 * 1000 // 24 horas stale máximo

export function getProductsCache(locationId) {
  try {
    const raw = localStorage.getItem(`pv_products_${locationId}`)
    if (!raw) return null
    const { data, ts } = JSON.parse(raw)
    const age = Date.now() - ts
    // Dentro de TTL: usar directamente
    if (age < PRODUCT_CACHE_TTL) return data
    // Stale pero dentro de 24h: devolver pero marcar como stale
    if (age < PRODUCT_CACHE_STALE) {
      data._stale = true
      return data
    }
    return null
  } catch {
    return null
  }
}

export function setProductsCache(locationId, data) {
  try {
    localStorage.setItem(`pv_products_${locationId}`, JSON.stringify({ data, ts: Date.now() }))
  } catch { /* ignore quota errors */ }
}

export function clearProductsCache(locationId) {
  if (locationId) {
    localStorage.removeItem(`pv_products_${locationId}`)
  } else {
    Object.keys(localStorage)
      .filter(k => k.startsWith('pv_products_'))
      .forEach(k => localStorage.removeItem(k))
  }
  // También el cache del service worker (stale-while-revalidate serviría el
  // catálogo viejo y volvería a poblar localStorage con datos pre-cambio)
  if (typeof caches !== 'undefined') {
    caches.delete('api-products').catch(() => {})
  }
}

// ---- Caché genérico para locations, registers, etc. ----
export function getCachedData(key) {
  try {
    const raw = localStorage.getItem(`pv_cache_${key}`)
    if (!raw) return null
    const { data, ts } = JSON.parse(raw)
    // 4 horas de TTL para datos de configuración
    if (Date.now() - ts > 4 * 60 * 60 * 1000) return null
    return data
  } catch { return null }
}

export function setCachedData(key, data) {
  try {
    localStorage.setItem(`pv_cache_${key}`, JSON.stringify({ data, ts: Date.now() }))
  } catch { /* ignore */ }
}
