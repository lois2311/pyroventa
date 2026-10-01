import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Loader2, Lock } from 'lucide-react'
import { superApi } from '../lib/superApi.js'
import VendraLogo from '../components/VendraLogo.jsx'
import { useTheme } from '../lib/theme.js'

export default function SuperLoginPage() {
  const theme = useTheme()
  const navigate = useNavigate()
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState(null)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true); setError(null)
    try {
      const data = await superApi.post('/auth/super/login', { email, password })
      localStorage.setItem('pv_super_token', data.token)
      navigate('/super')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-surface-600 px-gutter py-10">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="flex justify-center">
            <VendraLogo variant="horizontal" size="md" theme={theme} title="VENDRA POS" />
          </h1>
          <p className="mt-3 inline-flex items-center gap-1.5 text-gray-400 text-sm"><Lock className="h-3.5 w-3.5" aria-hidden="true" /> Panel de plataforma</p>
        </div>

        <form onSubmit={handleSubmit} className="card bg-surface-300 border-white/8 p-6 space-y-4 sm:p-8">
          <div>
            <label htmlFor="super-email" className="field-label">Email</label>
            <input
              id="super-email" type="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} required autoFocus
              className="input input-lg"
            />
          </div>
          <div>
            <label htmlFor="super-pass" className="field-label">Contraseña</label>
            <input
              id="super-pass" type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required
              className="input input-lg"
            />
          </div>
          {error && <p className="text-red-400 text-sm" role="alert">{error}</p>}
          <button type="submit" disabled={loading} className="btn btn-primary btn-lg w-full">
            {loading ? <Loader2 className="animate-spin h-4 w-4" /> : 'Ingresar'}
          </button>
        </form>
      </div>
    </div>
  )
}
