import { useState, useEffect, useRef, useCallback } from 'react'
import { useNetworkStatus } from '../hooks/useNetworkStatus.js'
import { pendingCount, syncAll } from '../lib/offlineQueue.js'
import { api } from '../lib/api.js'
import { useToast } from './Toast.jsx'

/**
 * Banner fijo que muestra el estado de conectividad.
 * - Rojo: sin conexión
 * - Amarillo: reconectando / sincronizando cola offline
 * - Verde breve: reconectado OK
 */
export default function NetworkBanner() {
  const { online, wasOffline } = useNetworkStatus()
  const { error: toastError } = useToast()
  const [syncing,    setSyncing]    = useState(false)
  const [syncResult, setSyncResult] = useState(null)
  const [queueSize,  setQueueSize]  = useState(0)
  const syncingRef = useRef(false)

  // Contar cola pendiente
  useEffect(() => {
    setQueueSize(pendingCount())
    const interval = setInterval(() => setQueueSize(pendingCount()), 5000)
    return () => clearInterval(interval)
  }, [])

  // Reintenta la cola offline. Usa `skipAuthRedirect` porque estas llamadas
  // corren en segundo plano: un 401 aquí (p.ej. un token de PIN de 7 días
  // que quedó vigente pero cuyo usuario fue promovido/reactivado con otro
  // tipo de sesión) no debe expulsar al usuario a mitad de una venta ya
  // hecha — offlineQueue.syncAll deja esa operación 'pending' para
  // reintentar cuando haya una sesión válida (próximo mount/login/transición
  // online). Los 4xx permanentes (403, etc.) sí se avisan con un toast.
  const doSync = useCallback(async () => {
    if (syncingRef.current) return
    const pending = pendingCount()
    if (pending === 0) return

    syncingRef.current = true
    setSyncing(true)
    try {
      const results = await syncAll(async (op) => {
        const opts = { skipAuthRedirect: true }
        if (op.type === 'create_invoice') {
          return await api.post('/invoices', op.payload, opts)
        }
        if (op.type === 'pay_invoice') {
          return await api.post(`/invoices/${op.payload.code}/pay`, op.payload.body, opts)
        }
        throw new Error(`Tipo de operación desconocido: ${op.type}`)
      })
      setSyncResult(results)
      setQueueSize(pendingCount())
      setTimeout(() => setSyncResult(null), 5000)
      for (const f of results.permanentFailures) {
        toastError(`No se pudo sincronizar una operación pendiente: ${f.message || 'error del servidor'}`)
      }
    } catch {
      // Error general de sincronización
    } finally {
      setSyncing(false)
      syncingRef.current = false
    }
  }, [toastError])

  // Auto-sincronizar cuando vuelve la conexión
  useEffect(() => {
    if (!wasOffline || !online) return
    doSync()
  }, [wasOffline, online, doSync])

  // Reintentar al iniciar la app (cola dejada de una sesión anterior) y al
  // iniciar sesión (authStore.login emite este evento): si no, una op quedaba
  // pendiente hasta la siguiente transición offline→online.
  useEffect(() => {
    if (online) doSync()
    window.addEventListener('pv:queue-sync', doSync)
    return () => window.removeEventListener('pv:queue-sync', doSync)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // No mostrar nada si está online y sin eventos
  if (online && !wasOffline && !syncing && !syncResult && queueSize === 0) {
    return null
  }

  // Verde: reconectado OK
  if (online && wasOffline && !syncing && syncResult) {
    return (
      <div className="fixed top-14 left-0 right-0 z-[100] bg-green-600 text-white text-xs text-center py-1.5 px-3 animate-fade-in">
        ✅ Reconectado — {syncResult.synced} operación(es) sincronizada(s)
        {syncResult.failed > 0 && `, ${syncResult.failed} fallida(s)`}
      </div>
    )
  }

  // Amarillo: sincronizando
  if (syncing) {
    return (
      <div className="fixed top-14 left-0 right-0 z-[100] bg-yellow-600 text-white text-xs text-center py-1.5 px-3 animate-fade-in">
        🔄 Sincronizando {queueSize} operación(es) pendiente(s)...
      </div>
    )
  }

  // Rojo: sin conexión
  if (!online) {
    return (
      <div className="fixed top-14 left-0 right-0 z-[100] bg-red-600 text-white text-xs text-center py-1.5 px-3">
        📡 Sin conexión — Las ventas se guardarán localmente y se sincronizarán al reconectar
        {queueSize > 0 && <span className="font-bold ml-2">({queueSize} pendiente{queueSize !== 1 ? 's' : ''})</span>}
      </div>
    )
  }

  // Indicador de cola pendiente (online pero con operaciones sin sincronizar)
  if (queueSize > 0 && online) {
    return (
      <div className="fixed top-14 left-0 right-0 z-[100] bg-yellow-600/90 text-white text-xs text-center py-1.5 px-3">
        ⚠️ {queueSize} operación(es) pendiente(s) de sincronizar
        <button
          onClick={() => window.location.reload()}
          className="ml-2 underline"
        >
          Reintentar
        </button>
      </div>
    )
  }

  return null
}
