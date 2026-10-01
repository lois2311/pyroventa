import { useSyncExternalStore } from 'react'
import { RefreshCw } from 'lucide-react'
import { applyUpdate, isUpdateReady, subscribeUpdate } from '../lib/appUpdate.js'

/**
 * Aviso discreto de versión nueva. La app se actualiza sola en cuanto la caja
 * está libre (ver appUpdate.js); el botón es para no esperar.
 * Abajo a la izquierda: no tapa el botón flotante del ticket ni los toasts.
 */
export default function UpdateBanner() {
  const ready = useSyncExternalStore(subscribeUpdate, isUpdateReady, () => false)
  if (!ready) return null
  return (
    <div
      role="status"
      className="fixed bottom-4 left-4 z-[90] flex max-w-[min(22rem,calc(100vw-12rem))] items-center gap-3 rounded-lg border border-brand-500/40 bg-surface-200 px-3 py-2 text-xs text-gray-300 animate-slide-up sm:max-w-sm"
      style={{ bottom: 'max(1rem, env(safe-area-inset-bottom))' }}
    >
      <span className="min-w-0">
        <strong className="font-semibold text-white">Versión nueva lista.</strong>{' '}
        <span className="hidden sm:inline">Se instala sola cuando la caja quede libre.</span>
      </span>
      <button type="button" onClick={applyUpdate} className="btn-primary btn-sm shrink-0">
        <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" /> Actualizar
      </button>
    </div>
  )
}
