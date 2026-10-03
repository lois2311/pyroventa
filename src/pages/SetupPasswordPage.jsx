import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { CheckCircle2, Circle, Loader2, ShieldCheck, TriangleAlert } from 'lucide-react'
import { api } from '../lib/api.js'
import VendraLogo from '../components/VendraLogo.jsx'
import ThemeToggle from '../components/ThemeToggle.jsx'
import { useTheme } from '../lib/theme.js'

const MIN_PASSWORD = 10

function Requirement({ ok, children }) {
  const Icon = ok ? CheckCircle2 : Circle
  return (
    <li className={`flex items-center gap-2 text-xs ${ok ? 'text-brand-400' : 'text-gray-400'}`}>
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> {children}
    </li>
  )
}

// Vista pública: la persona define su propia clave con el enlace que le dio el superadministrador
export default function SetupPasswordPage() {
  const { token } = useParams()
  const navigate = useNavigate()
  const theme = useTheme()

  const [state, setState] = useState('checking') // checking | ready | invalid | done
  const [info, setInfo] = useState(null)
  const [message, setMessage] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    api.get(`/auth/setup-password/validate/${encodeURIComponent(token)}`, { retries: 0 })
      .then(d => { if (alive) { setInfo(d); setState('ready') } })
      .catch(e => { if (alive) { setMessage(e.message); setState('invalid') } })
    return () => { alive = false }
  }, [token])

  const longEnough = password.length >= MIN_PASSWORD
  const matches = confirm.length > 0 && password === confirm

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!longEnough || !matches || saving) return
    setSaving(true); setError('')
    try {
      await api.post('/auth/setup-password/submit', { token, password, confirmPassword: confirm }, { retries: 0 })
      setPassword(''); setConfirm('')
      setState('done')
    } catch (err) {
      setError(err.message)
      if (err.status === 400 && /enlace/i.test(err.message)) { setMessage(err.message); setState('invalid') }
    } finally { setSaving(false) }
  }

  return (
    <div className="relative flex min-h-[100dvh] items-center justify-center overflow-hidden bg-surface-600 px-gutter py-10">
      <ThemeToggle className="absolute right-3 top-3 sm:right-5 sm:top-5" />
      <div className="relative w-full max-w-md">
        <h1 className="mb-8 flex justify-center">
          <VendraLogo variant="endorsement" size={64} theme={theme} title="VENDRA POS by flightdev" />
        </h1>

        <div className="card bg-surface-300 border-white/8 p-6 sm:p-8">
          {state === 'checking' && (
            <div className="py-10 text-center" role="status">
              <Loader2 className="mx-auto h-6 w-6 animate-spin text-brand-500" />
              <p className="mt-3 text-sm text-gray-400">Validando enlace…</p>
            </div>
          )}

          {state === 'invalid' && (
            <div className="space-y-4 text-center" role="alert">
              <TriangleAlert className="mx-auto h-8 w-8 text-amber-400" aria-hidden="true" />
              <p className="text-sm text-gray-300">{message}</p>
              <Link to="/login" className="btn btn-ghost btn-lg w-full">Ir al inicio de sesión</Link>
            </div>
          )}

          {state === 'ready' && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <h2 className="font-display text-lg font-semibold text-white">Establece tu clave</h2>
                <p className="mt-1 text-sm text-gray-400">
                  Hola, <span className="text-white">{info.name}</span>
                  {info.username && <> · usuario <span className="font-mono text-white">{info.username}</span></>}
                </p>
              </div>
              <div>
                <label htmlFor="sp-pass" className="field-label">Nueva contraseña</label>
                <input id="sp-pass" type="password" value={password} onChange={e => setPassword(e.target.value)}
                  autoComplete="new-password" autoFocus className="input input-lg" />
              </div>
              <div>
                <label htmlFor="sp-confirm" className="field-label">Confirma tu contraseña</label>
                <input id="sp-confirm" type="password" value={confirm} onChange={e => setConfirm(e.target.value)}
                  autoComplete="new-password" className="input input-lg" />
              </div>
              <ul className="space-y-1" aria-label="Requisitos de la contraseña">
                <Requirement ok={longEnough}>Al menos {MIN_PASSWORD} caracteres</Requirement>
                <Requirement ok={matches}>Las dos contraseñas coinciden</Requirement>
              </ul>
              {error && <p className="text-sm text-red-400" role="alert">{error}</p>}
              <button type="submit" disabled={!longEnough || !matches || saving} className="btn btn-primary btn-lg w-full">
                {saving
                  ? <span className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Guardando…</span>
                  : <span className="inline-flex items-center gap-2"><ShieldCheck className="h-4 w-4" /> Guardar contraseña</span>}
              </button>
            </form>
          )}

          {state === 'done' && (
            <div className="space-y-4 text-center" role="status">
              <CheckCircle2 className="mx-auto h-8 w-8 text-brand-400" aria-hidden="true" />
              <h2 className="font-display text-lg font-semibold text-white">Clave configurada exitosamente</h2>
              <p className="text-sm text-gray-400">Ya puedes iniciar sesión con tu usuario y tu nueva contraseña.</p>
              <button type="button" onClick={() => navigate('/login')} className="btn btn-primary btn-lg w-full">
                Ir al inicio de sesión
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
