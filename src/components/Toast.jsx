import { createContext, useContext, useState, useCallback, useRef } from 'react'

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
const STYLES = {
  success: { bg: 'bg-green-900/90 border-green-500/40',  icon: '✓', text: 'text-green-300' },
  error:   { bg: 'bg-red-900/90 border-red-500/40',      icon: '✕', text: 'text-red-300'   },
  warning: { bg: 'bg-yellow-900/90 border-yellow-500/40',icon: '⚠', text: 'text-yellow-300'},
  info:    { bg: 'bg-surface-200 border-white/10',        icon: 'ℹ', text: 'text-gray-300'  },
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
            className={`${s.bg} border rounded-xl px-4 py-3 flex items-start gap-3 animate-slide-left pointer-events-auto`}
          >
            <span className={`${s.text} font-bold mt-0.5 shrink-0`}>{s.icon}</span>
            <span className="text-sm text-white/90 flex-1 leading-snug">{t.message}</span>
            <button
              type="button"
              onClick={() => onDismiss(t.id)}
              aria-label="Cerrar aviso"
              className="-my-1 -mr-2 flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-lg leading-none text-gray-400 transition-colors hover:bg-white/10 hover:text-white"
            >
              ×
            </button>
          </div>
        )
      })}
    </div>
  )
}
