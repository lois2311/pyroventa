import { createContext, useContext, useState, useCallback, useRef } from 'react'
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react'

// ---- Context --------------------------------------------
const ToastContext = createContext(null)

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const timerRef = useRef({})

  const dismiss = useCallback((id) => {
    clearTimeout(timerRef.current[id])
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  const toast = useCallback((message, type = 'info', duration = 3500) => {
    const id = Date.now() + Math.random()
    setToasts(prev => [...prev.slice(-4), { id, message, type }]) // máximo 5 toasts

    timerRef.current[id] = setTimeout(() => dismiss(id), duration)
    return id
  }, [dismiss])

  const success = useCallback((msg, dur) => toast(msg, 'success', dur), [toast])
  const error   = useCallback((msg, dur) => toast(msg, 'error', dur ?? 5000), [toast])
  const info    = useCallback((msg, dur) => toast(msg, 'info', dur), [toast])
  const warn    = useCallback((msg, dur) => toast(msg, 'warning', dur), [toast])

  return (
    <ToastContext.Provider value={{ toast, success, error, info, warn, dismiss }}>
      {children}
      <ToastContainer toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast debe usarse dentro de <ToastProvider>')
  return ctx
}

// ---- Componente de toasts --------------------------------
// Fondo de superficie con borde e ícono del estado (Correcto, Error,
// Atención, Info): mismo lenguaje que el resto del POS, sin glifos sueltos.
const STYLES = {
  success: { bg: 'bg-surface-200 border-green-400/40',  Icon: CheckCircle2,  text: 'text-green-400' },
  error:   { bg: 'bg-surface-200 border-red-400/50',    Icon: XCircle,       text: 'text-red-400'   },
  warning: { bg: 'bg-surface-200 border-yellow-400/50', Icon: AlertTriangle, text: 'text-yellow-400'},
  info:    { bg: 'bg-surface-200 border-white/10',      Icon: Info,          text: 'text-blue-400'  },
}

// El contenedor se monta siempre (aunque esté vacío): una región aria-live
// que aparece junto con su contenido no se anuncia en los lectores de pantalla.
function ToastContainer({ toasts, onDismiss }) {
  return (
    <div
      className="pointer-events-none fixed left-4 right-4 z-[9998] flex flex-col gap-2 sm:left-auto sm:w-full sm:max-w-sm"
      style={{ top: 'max(1rem, env(safe-area-inset-top))' }}
      role="status"
      aria-live="polite"
    >
      {toasts.map(t => {
        const s = STYLES[t.type] || STYLES.info
        return (
          <div
            key={t.id}
            className={`${s.bg} border rounded-lg px-4 py-3 flex items-start gap-3 animate-slide-left pointer-events-auto`}
          >
            <s.Icon className={`${s.text} mt-0.5 h-4 w-4 shrink-0`} aria-hidden="true" />
            <span className="text-sm text-white flex-1 leading-snug">{t.message}</span>
            <button
              type="button"
              onClick={() => onDismiss(t.id)}
              aria-label="Cerrar aviso"
              className="press -my-2 -mr-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-gray-400 hover:bg-surface-50 hover:text-white"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        )
      })}
    </div>
  )
}
