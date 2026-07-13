import { useEffect, useState } from 'react'
import { ShieldAlert } from 'lucide-react'
import { useAuthStore } from '../store/authStore.js'

// Overlay bloqueante cuando la API responde 403 de licencia/suspensión
export default function LicenseBlock() {
  const [error, setError] = useState(null) // { code, message }
  const logout = useAuthStore(s => s.logout)

  useEffect(() => {
    const handler = (e) => setError(e.detail)
    window.addEventListener('pv:license-error', handler)
    return () => window.removeEventListener('pv:license-error', handler)
  }, [])

  if (!error) return null

  const handleLogout = () => {
    logout()
    setError(null)
    window.location.href = '/login'
  }

  return (
    <div className="fixed inset-0 z-[1200] bg-black/90 backdrop-blur flex items-center justify-center p-6">
      <div className="card bg-surface-300 border-red-500/30 p-8 max-w-md text-center">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-red-500/15 border border-red-500/30 mb-4">
          <ShieldAlert className="w-7 h-7 text-red-400" />
        </div>
        <h2 className="font-syne text-xl font-bold text-white mb-2">Acceso suspendido</h2>
        <p className="text-gray-400 text-sm mb-6">{error.message}</p>
        <button onClick={handleLogout} className="btn btn-primary w-full">
          Cerrar sesión
        </button>
      </div>
    </div>
  )
}
