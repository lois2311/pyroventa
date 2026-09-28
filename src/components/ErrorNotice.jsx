import { AlertTriangle, RefreshCw, WifiOff } from 'lucide-react'

/**
 * Aviso de error en línea, con reintento. Reemplaza los `.catch(() => {})`
 * que dejaban paneles vacíos sin explicación cuando un reporte fallaba.
 */
export default function ErrorNotice({ error, onRetry, title = 'No se pudo cargar la información', className = '' }) {
  if (!error) return null
  const Icon = error.offline ? WifiOff : AlertTriangle
  const detail = error.offline
    ? 'Sin conexión. Revisa la red e intenta de nuevo.'
    : (error.message || 'Ocurrió un error inesperado.')

  return (
    <div role="alert" className={`flex items-start gap-3 rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 ${className}`}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-red-400" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-red-300">{title}</p>
        <p className="mt-0.5 text-xs text-red-300/80">{detail}</p>
      </div>
      {onRetry && (
        <button type="button" onClick={onRetry} className="btn-outline btn-sm shrink-0">
          <RefreshCw className="h-3.5 w-3.5" /> Reintentar
        </button>
      )}
    </div>
  )
}
