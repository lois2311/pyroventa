import { useState, useEffect, useCallback } from 'react'

/**
 * Hook que detecta el estado de conectividad del navegador.
 * Retorna: { online, wasOffline, latency }
 * - online: boolean — si hay conexión de red
 * - wasOffline: boolean — si acaba de volver de estar offline (para sincronización)
 * - latency: number|null — ms de respuesta del último ping
 */
export function useNetworkStatus() {
  const [online,     setOnline]     = useState(navigator.onLine)
  const [wasOffline, setWasOffline] = useState(false)
  const [latency,    setLatency]    = useState(null)

  const handleOnline = useCallback(() => {
    setOnline(true)
    setWasOffline(true)
    // Limpiar wasOffline después de 10s (tiempo para que los componentes sincronicen)
    setTimeout(() => setWasOffline(false), 10000)
  }, [])

  const handleOffline = useCallback(() => {
    setOnline(false)
    setLatency(null)
  }, [])

  useEffect(() => {
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [handleOnline, handleOffline])

  // Ping periódico para detectar conexiones "fantasma" (online pero sin internet real)
  useEffect(() => {
    if (!online) return

    let active = true
    const ping = async () => {
      if (!active) return
      const start = performance.now()
      try {
        // Usamos un endpoint de Supabase o un recurso estático pequeño
        await fetch('/manifest.json', { cache: 'no-store', signal: AbortSignal.timeout(5000) })
        if (active) setLatency(Math.round(performance.now() - start))
      } catch {
        // Si no puede alcanzar ni un recurso local, probablemente está offline real
        if (active && !navigator.onLine) {
          setOnline(false)
          setLatency(null)
        }
      }
    }

    ping()
    const interval = setInterval(ping, 30000) // cada 30s
    return () => { active = false; clearInterval(interval) }
  }, [online])

  return { online, wasOffline, latency }
}
