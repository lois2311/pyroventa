import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './store/authStore.js'
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

// ---- Guard de rol ----------------------------------------
function RequireRole({ roles, children }) {
  const seller = useAuthStore(s => s.seller)
  if (!seller) return <Navigate to="/login" replace />
  if (roles && !roles.includes(seller.role)) return <Navigate to="/login" replace />
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
          <RequireRole roles={['seller', 'admin']}>
            <VendedorPage />
          </RequireRole>
        } />

        <Route path="/caja" element={
          <RequireRole roles={['cashier', 'admin']}>
            <CajaPage />
          </RequireRole>
        } />

        <Route path="/admin" element={
          <RequireRole roles={['admin']}>
            <AdminPage />
          </RequireRole>
        } />

        <Route path="/super/login" element={<SuperLoginPage />} />
        <Route path="/super"       element={<SuperDashboard />} />

        {/* Redirect por defecto */}
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </ToastProvider>
  )
}
