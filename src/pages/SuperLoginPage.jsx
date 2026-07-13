import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Loader2, Lock } from 'lucide-react'
import { superApi } from '../lib/superApi.js'

export default function SuperLoginPage() {
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
    <div className="min-h-screen bg-[#0d0d0d] flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-brand-500/15 border border-brand-500/30 mb-3">
            <Lock className="w-8 h-8 text-brand-500" />
          </div>
          <h1 className="font-syne text-2xl font-bold text-white">PyroVenta</h1>
          <p className="text-gray-500 text-sm mt-1">Panel de plataforma</p>
        </div>

        <form onSubmit={handleSubmit} className="card bg-surface-300 border-white/8 p-6 space-y-4">
          <div>
            <label className="text-gray-400 text-sm block mb-1.5">Email</label>
            <input
              type="email" value={email} onChange={e => setEmail(e.target.value)} required autoFocus
              className="w-full px-4 py-2.5 rounded-xl bg-surface-400 border-2 border-white/10 text-white focus:border-brand-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="text-gray-400 text-sm block mb-1.5">Contraseña</label>
            <input
              type="password" value={password} onChange={e => setPassword(e.target.value)} required
              className="w-full px-4 py-2.5 rounded-xl bg-surface-400 border-2 border-white/10 text-white focus:border-brand-500 focus:outline-none"
            />
          </div>
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <button type="submit" disabled={loading} className="btn btn-primary btn-lg w-full">
            {loading ? <Loader2 className="animate-spin h-4 w-4" /> : 'Ingresar'}
          </button>
        </form>
      </div>
    </div>
  )
}
