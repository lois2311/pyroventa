import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../lib/api.js'

/**
 * GET declarativo con cancelación.
 *
 * - Cuando cambia `path` (otro rango de fechas, otro punto) o el componente
 *   se desmonta, el pedido anterior se aborta y su respuesta se descarta:
 *   una respuesta vieja nunca pisa a la nueva. Antes, cambiar rápido de
 *   "Hoy" a "30 días" podía terminar mostrando los datos de "Hoy".
 * - `data` se conserva mientras recarga (el marco no vuelve al esqueleto).
 * - `error` queda disponible para mostrarlo con <ErrorNotice>; `refetch()`
 *   vuelve a pedir. Nada de `.catch(() => {})` silenciosos.
 * - `path` null/false = no pedir (p. ej. el rol no tiene ese reporte).
 */
export function useApi(path, { initialData = null } = {}) {
  const [state, setState] = useState({ data: initialData, error: null, loading: Boolean(path) })
  const [nonce, setNonce] = useState(0)
  const initialRef = useRef(initialData)

  useEffect(() => {
    if (!path) {
      setState({ data: initialRef.current, error: null, loading: false })
      return undefined
    }
    const controller = new AbortController()
    setState(s => ({ ...s, loading: true, error: null }))
    api.get(path, { signal: controller.signal })
      .then(data => {
        if (!controller.signal.aborted) setState({ data, error: null, loading: false })
      })
      .catch(error => {
        if (controller.signal.aborted || error.canceled) return
        setState(s => ({ ...s, error, loading: false }))
      })
    return () => controller.abort()
  }, [path, nonce])

  const refetch = useCallback(() => setNonce(n => n + 1), [])
  const setData = useCallback((updater) => {
    setState(s => ({ ...s, data: typeof updater === 'function' ? updater(s.data) : updater }))
  }, [])

  return { ...state, refetch, setData }
}
