import { AlertTriangle, LifeBuoy, RefreshCw, WifiOff } from 'lucide-react'

/**
 * Aviso de error en línea, con reintento y acceso directo a soporte.
 */
export default function ErrorNotice({ error, onRetry, onSupport, title = 'No se pudo cargar la información', className = '' }) {
  if (!error) return null
  const Icon = error.offline ? WifiOff : AlertTriangle
  const detail = error.offline
    ? 'Sin conexión. Revisa la red e intenta de nuevo.'
    : (error.message || 'Ocurrió un error inesperado.')

  const handleSupport = onSupport || (() => {
    window.dispatchEvent(new CustomEvent('vendra:open-support', { detail: { error } }))
  })

  return (
    <div role="alert" className={`flex flex-wrap items-start gap-3 rounded-lg border border-red-500/25 bg-red-500/10 px-4 py-3 ${className}`}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-red-400" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-red-300">{title}</p>
        <p className="mt-0.5 text-xs text-red-300">{detail}</p>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        {onRetry && (
          <button type="button" onClick={onRetry} className="btn-outline btn-sm">
            <RefreshCw className="h-3.5 w-3.5" /> Reintentar
          </button>
        )}
        <button
          type="button"
          onClick={handleSupport}
          className="btn-ghost btn-sm text-xs text-red-200 hover:text-white flex items-center gap-1"
          title="Solicitar asistencia a soporte técnico"
        >
          <LifeBuoy className="h-3.5 w-3.5 text-brand-400" /> Ayuda
        </button>
      </div>
    </div>
  )
}

