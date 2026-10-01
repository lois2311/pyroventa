import { useEffect, useRef } from 'react'
import { api, getProductsCache, setProductsCache } from '../lib/api.js'

/** Cada cuánto se revisa el catálogo con la pantalla visible. */
export const CATALOG_REFRESH_MS = 30_000

/**
 * Catálogo en vivo en todos los equipos: precios, productos nuevos, fotos y
 * existencias que cambian en otro equipo (o tras una venta en otra caja)
 * llegan solos, sin recargar. Revisa cada 30 s con la pantalla visible, al
 * volver a ella y al recuperar la conexión; solo avisa (onChange) si algo
 * cambió, para no re-renderizar la grilla en cada revisión.
 *
 * Por qué no Supabase Realtime: las tablas tienen RLS sin políticas, así que
 * la clave pública del navegador no puede leerlas (y abrirlas expondría el
 * catálogo de todas las empresas). Se usa la misma API con su permiso.
 */
export function useCatalogRefresh(locationId, onChange) {
  const onChangeRef = useRef(onChange)
  useEffect(() => { onChangeRef.current = onChange })

  useEffect(() => {
    if (!locationId) return
    let last = JSON.stringify(getProductsCache(locationId) ?? null)
    let controller = null

    const refresh = () => {
      if (document.visibilityState !== 'visible' || !navigator.onLine) return
      controller?.abort()
      controller = new AbortController()
      api.get(`/products?location_id=${locationId}`, { signal: controller.signal, retries: 0 })
        .then(data => {
          if (!data?.length) return
          const next = JSON.stringify(data)
          if (next === last) return
          last = next
          setProductsCache(locationId, data)
          onChangeRef.current(data)
        })
        .catch(() => { /* sin red o servidor ocupado: la próxima revisión */ })
    }

    const timer = setInterval(refresh, CATALOG_REFRESH_MS)
    const onVisible = () => { if (document.visibilityState === 'visible') refresh() }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('online', refresh)
    return () => {
      clearInterval(timer)
      controller?.abort()
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('online', refresh)
    }
  }, [locationId])
}
