import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './store/authStore.js'
import { can } from '../api/_lib/roles.js'
import LoginPage    from './pages/LoginPage.jsx'
import TenantEntry  from './pages/TenantEntry.jsx'
import VendedorPage from './pages/VendedorPage.jsx'
import CajaPage     from './pages/CajaPage.jsx'
import AdminPage    from './pages/AdminPage.jsx'
import SuperLoginPage from './pages/SuperLoginPage.jsx'
import SuperDashboard from './pages/SuperDashboard.jsx'
import { ToastProvider } from './components/Toast.jsx'
import NetworkBanner from './components/NetworkBanner.jsx'
import LicenseBlock from './components/LicenseBlock.jsx'

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

// ---- App ------------------------------------------------
export default function App() {
  return (
    <ToastProvider>
      <CompactViewportHint />
      <NetworkBanner />
      <LicenseBlock />
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
    </ToastProvider>
  )
}
