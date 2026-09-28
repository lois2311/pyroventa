import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import './styles/fonts.css'
import './styles/index.css'

// Monitoreo de errores (opcional): solo se carga si VITE_SENTRY_DSN está configurado
if (import.meta.env.VITE_SENTRY_DSN) {
  import('@sentry/react').then(Sentry => {
    Sentry.init({
      dsn: import.meta.env.VITE_SENTRY_DSN,
      environment: import.meta.env.MODE,
      tracesSampleRate: 0,
    })
  }).catch(() => {})
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {/* Flags de react-router v7 activadas desde ya: sin avisos en consola y
        sin sorpresas al actualizar (las transiciones de ruta usan startTransition). */}
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <App />
    </BrowserRouter>
  </React.StrictMode>
)
