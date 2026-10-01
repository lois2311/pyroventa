import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './store/authStore.js'
import { can } from '../api/_lib/roles.js'
import LoginPage    from './pages/LoginPage.jsx'
import TenantEntry  from './pages/TenantEntry.jsx'
import SuperLoginPage from './pages/SuperLoginPage.jsx'
import { ToastProvider } from './components/Toast.jsx'
import { ConfirmProvider } from './components/ConfirmDialog.jsx'
import NetworkBanner from './components/NetworkBanner.jsx'
import LicenseBlock from './components/LicenseBlock.jsx'
import VendraLogo from './components/VendraLogo.jsx'
import { useTheme } from './lib/theme.js'

// Cada pantalla carga aparte: el login no descarga el POS, y Vender no descarga
// Caja (que trae el cliente de Supabase Realtime) ni Administración (Recharts,
// reportes). El service worker igual las precachea, así que funcionan offline.
const VendedorPage   = lazy(() => import('./pages/VendedorPage.jsx'))
const CajaPage       = lazy(() => import('./pages/CajaPage.jsx'))
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
        Pantalla muy angosta. Gira el equipo o usa al menos <strong>360px</strong> de ancho.
      </p>
    </div>
  )
}

// ---- Carga de una vista diferida (pantalla de carga VENDRA) ----
// Uno de los pocos lugares donde va el respaldo "by flightdev".
function PageLoader() {
  const theme = useTheme()
  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center" role="status" aria-live="polite">
      <VendraLogo variant="endorsement" size="lg" theme={theme} className="animate-pulse" />
      <span className="sr-only">Cargando…</span>
    </div>
  )
}

// ---- App ------------------------------------------------
export default function App() {
  return (
    <ToastProvider>
      <ConfirmProvider>
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
      </ConfirmProvider>
    </ToastProvider>
  )
}
