import { useState, useEffect } from 'react'
import { useNetworkStatus } from '../hooks/useNetworkStatus.js'
import { pendingCount, syncAll } from '../lib/offlineQueue.js'
import { api } from '../lib/api.js'

/**
 * Banner fijo que muestra el estado de conectividad.
 * - Rojo: sin conexión
 * - Amarillo: reconectando / sincronizando cola offline
 * - Verde breve: reconectado OK
 */
export default function NetworkBanner() {
  const { online, wasOffline } = useNetworkStatus()
  const [syncing,    setSyncing]    = useState(false)
  const [syncResult, setSyncResult] = useState(null)
  const [queueSize,  setQueueSize]  = useState(0)

  // Contar cola pendiente
  useEffect(() => {
    setQueueSize(pendingCount())
    const interval = setInterval(() => setQueueSize(pendingCount()), 5000)
    return () => clearInterval(interval)
  }, [])

  // Auto-sincronizar cuando vuelve la conexión
  useEffect(() => {
    if (!wasOffline || !online) return

    const doSync = async () => {
      const pending = pendingCount()
      if (pending === 0) return

      setSyncing(true)
      try {
        const results = await syncAll(async (op) => {
          if (op.type === 'create_invoice') {
            return await api.post('/invoices', op.payload)
          }
          if (op.type === 'pay_invoice') {
            return await api.post(`/invoices/${op.payload.code}/pay`, op.payload.body)
          }
          throw new Error(`Tipo de operación desconocido: ${op.type}`)
        })
        setSyncResult(results)
        setQueueSize(pendingCount())
        setTimeout(() => setSyncResult(null), 5000)
      } catch {
        // Error general de sincronización
      } finally {
        setSyncing(false)
      }
    }

    doSync()
  }, [wasOffline, online])

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
