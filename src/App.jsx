import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { Flame } from 'lucide-react'
import { useAuthStore } from './store/authStore.js'
import { can } from '../api/_lib/roles.js'
import LoginPage    from './pages/LoginPage.jsx'
import TenantEntry  from './pages/TenantEntry.jsx'
import VendedorPage from './pages/VendedorPage.jsx'
import CajaPage     from './pages/CajaPage.jsx'
import SuperLoginPage from './pages/SuperLoginPage.jsx'
import { ToastProvider } from './components/Toast.jsx'
import NetworkBanner from './components/NetworkBanner.jsx'
import LicenseBlock from './components/LicenseBlock.jsx'

// Administración y el panel de plataforma cargan aparte (traen Recharts y los
// reportes): el POS (Vender / Caja) arranca sin descargar ni parsear ese código.
// El service worker igual los precachea, así que funcionan offline.
const AdminPage      = lazy(() => import('./pages/AdminPage.jsx'))
const SuperDashboard = lazy(() => import('./pages/SuperDashboard.jsx'))

// ---- Guard por acción (roles.js) ---------------------------
function RequireCan({ action, needsLocation = false, children }) {
  const seller   = useAuthStore(s => s.seller)
  const location = useAuthStore(s => s.location)
  if (!seller) return <Navigate to="/login" replace />
  if (!can(seller.role, action)) return <Navigate to="/login" replace />
  // El superadmin en modo "todos los puntos" debe elegir uno para operar
  if (needsLocation && !location) return <Navigate to="/admin" replace />
  return children
}

// ---- Aviso para pantallas ultra compactas ---------------
function CompactViewportHint() {
  return (
    <div
      id="compact-viewport-hint"
      className="hidden fixed bottom-3 left-3 right-3 z-[1100] rounded-xl border border-amber-500/40 bg-amber-900/80 backdrop-blur px-3 py-2 text-center"
    >
      <p className="text-amber-200 text-xs">
        Vista compacta activa. Para una experiencia optima, usa un ancho de al menos <strong>360px</strong>.
      </p>
    </div>
  )
}

// ---- Carga de una vista diferida ----------------------------
function PageLoader() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center" role="status" aria-live="polite">
      <span className="flex h-12 w-12 animate-pulse items-center justify-center rounded-2xl border border-brand-500/30 bg-brand-500/15">
        <Flame className="h-6 w-6 text-brand-500" />
      </span>
      <span className="sr-only">Cargando…</span>
    </div>
  )
}

// ---- App ------------------------------------------------
export default function App() {
  return (
    <ToastProvider>
      <CompactViewportHint />
      <NetworkBanner />
      <LicenseBlock />
      <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/c/:slug" element={<TenantEntry />} />
        <Route path="/login" element={<LoginPage />} />

        <Route path="/vender" element={
          <RequireCan action="sell" needsLocation>
            <VendedorPage />
          </RequireCan>
        } />

        <Route path="/caja" element={
          <RequireCan action="charge" needsLocation>
            <CajaPage />
          </RequireCan>
        } />

        <Route path="/admin" element={
          <RequireCan action="view_reports">
            <AdminPage />
          </RequireCan>
        } />

        <Route path="/super/login" element={<SuperLoginPage />} />
        <Route path="/super"       element={<SuperDashboard />} />

        {/* Redirect por defecto */}
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
      </Suspense>
    </ToastProvider>
  )
}
