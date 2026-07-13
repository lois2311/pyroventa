import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Delete, Flame, Loader2, ShieldCheck } from 'lucide-react'
import { useAuthStore } from '../store/authStore.js'
import { api } from '../lib/api.js'
import LocationSelector from '../components/LocationSelector.jsx'
import { useToast } from '../components/Toast.jsx'

// ---- Teclado numérico virtual ---------------------------
function NumPad({ value, onChange, onSubmit, loading }) {
  const keys = ['1','2','3','4','5','6','7','8','9','','0','⌫']

  const handleKey = (k) => {
    if (k === '⌫') {
      onChange(value.slice(0, -1))
    } else if (k !== '' && value.length < 4) {
      const next = value + k
      onChange(next)
      if (next.length === 4) {
        setTimeout(() => onSubmit(next), 100)
      }
    }
  }

  return (
    <div className="w-full max-w-[220px] mx-auto">
      <div className="flex justify-center gap-3 mb-5">
        {[0,1,2,3].map(i => (
          <div
            key={i}
            className={`
              w-11 h-11 rounded-xl border-2 flex items-center justify-center font-mono text-xl font-bold transition-all duration-150
              ${i < value.length
                ? 'bg-brand-500/20 border-brand-500 text-brand-400'
                : 'bg-surface-300 border-white/10 text-gray-700'
              }
            `}
          >
            {i < value.length ? '●' : ''}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-2">
        {keys.map((k, idx) => (
          <button
            key={idx}
            onClick={() => k && handleKey(k)}
            disabled={loading || k === ''}
            className={`
              numpad-key
              ${k === '⌫' ? 'text-red-400 hover:bg-red-900/20' : ''}
              ${k === '' ? 'invisible' : ''}
            `}
          >
            {k === '⌫' ? <Delete className="w-5 h-5" /> : k}
          </button>
        ))}
      </div>
    </div>
  )
}

// ---- Selector de caja -----------------------------------
function RegisterSelector({ locationId, value, onChange }) {
  const [registers, setRegisters] = useState([])
  const [loading,   setLoading]   = useState(true)

  useEffect(() => {
    if (!locationId) return
    setLoading(true)
    api.get(`/registers?location_id=${locationId}`)
      .then(d => setRegisters(d || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [locationId])

  if (loading) {
    return (
      <div className="space-y-2">
        {[1,2].map(i => <div key={i} className="skeleton h-14 rounded-xl" />)}
      </div>
    )
  }

  if (registers.length === 0) {
    return (
      <p className="text-gray-500 text-sm text-center py-4">
        No hay cajas registradas para este punto de venta.
        <br />
        <span className="text-xs text-gray-600">Un admin debe crear cajas desde Administración.</span>
      </p>
    )
  }

  return (
    <div className="grid grid-cols-2 gap-2">
      {registers.map(reg => {
        const selected = value?.id === reg.id
        return (
          <button
            key={reg.id}
            onClick={() => onChange(reg)}
            className={`
              p-3 rounded-xl border-2 text-center transition-all duration-150
              ${selected
                ? 'bg-brand-500/20 border-brand-500 text-brand-300'
                : 'bg-surface-400 border-white/5 text-gray-300 hover:border-white/20 hover:text-white'
              }
            `}
          >
            <span className="text-xl block mb-1">🖥</span>
            <span className="text-sm font-medium">{reg.name}</span>
          </button>
        )
      })}
    </div>
  )
}

// ---- LoginPage ------------------------------------------
export default function LoginPage() {
  const navigate = useNavigate()
  const { login, setRegister } = useAuthStore()
  const { error: toastError } = useToast()

  const [step,         setStep]         = useState('company') // 'company' | 'location' | 'pin' | 'register'
  const [slugInput,    setSlugInput]    = useState('')
  const [tenant,       setTenant]      = useState(null)      // { id, name, slug }
  const [locations,    setLocations]   = useState([])
  const [bootLoading,  setBootLoading] = useState(true)
  const [location,     setLocation]     = useState(null)
  const [pin,          setPin]          = useState('')
  const [loading,      setLoading]      = useState(false)
  const [loginData,    setLoginData]    = useState(null)
  const [selectedReg,  setSelectedReg]  = useState(null)

  const loadTenant = async (slug) => {
    setBootLoading(true)
    try {
      const data = await api.get(`/public/tenant/${encodeURIComponent(slug)}`)
      setTenant(data.tenant)
      setLocations(data.locations || [])
      localStorage.setItem('pv_tenant_slug', data.tenant.slug)
      setStep('location')
    } catch (err) {
      if (err.status === 404 || err.status === 403) {
        // Rechazo definitivo del servidor (no existe / licencia): soltar el amarre
        localStorage.removeItem('pv_tenant_slug')
        setTenant(null)
        toastError(err.message)
      } else if (err.status) {
        // Error del servidor (5xx): conservar el slug y avisar
        toastError('Error del servidor — reintenta en un momento')
      } else {
        // Falla de red: conservar el slug para reintentar
        toastError('Sin conexión — reintenta en un momento')
      }
      setStep('company')
    } finally {
      setBootLoading(false)
    }
  }

  useEffect(() => {
    const saved = localStorage.getItem('pv_tenant_slug')
    if (saved) loadTenant(saved)
    else setBootLoading(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleCompanySubmit = (e) => {
    e.preventDefault()
    const slug = slugInput.trim().toLowerCase()
    if (slug) loadTenant(slug)
  }

  const handleChangeCompany = () => {
    localStorage.removeItem('pv_tenant_slug')
    setTenant(null); setLocation(null); setSlugInput('')
    setStep('company')
  }

  const handleLocationNext = () => {
    if (!location) return
    setPin('')
    setStep('pin')
  }

  const handleLogin = async (finalPin) => {
    const p = finalPin || pin
    if (p.length !== 4) return

    setLoading(true)
    try {
      const data = await api.post('/auth/login', { pin: p, location_id: location.id, tenant_slug: tenant.slug })
      login(data.seller, data.location, data.tenant, data.token)

      // Si es cajero o admin yendo a caja → pedir selección de caja
      if (data.seller.role === 'cashier') {
        setLoginData(data)
        setStep('register')
        setLoading(false)
        return
      }

      // Admin y vendedores van directo
      if      (data.seller.role === 'admin') navigate('/admin')
      else                                    navigate('/vender')
    } catch (err) {
      toastError(err.message || 'PIN incorrecto')
      setPin('')
    } finally {
      setLoading(false)
    }
  }

  const handleRegisterNext = () => {
    if (!selectedReg) return
    setRegister(selectedReg)

    // Navegar según rol
    if (loginData?.seller?.role === 'admin') navigate('/admin')
    else                                      navigate('/caja')
  }

  const handleSkipRegister = () => {
    setRegister(null)
    if (loginData?.seller?.role === 'admin') navigate('/admin')
    else                                      navigate('/caja')
  }

  return (
    <div className="min-h-screen bg-[#0d0d0d] flex items-center justify-center p-4">
      <div className="w-full max-w-lg">

        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-brand-500/15 border border-brand-500/30 mb-3">
            <Flame className="w-8 h-8 text-brand-500" />
          </div>
          <h1 className="font-syne text-3xl font-bold text-white tracking-tight">PyroVenta</h1>
          <p className="text-gray-500 text-sm mt-1">
            {tenant ? tenant.name : 'Sistema de control de ventas'}
          </p>
        </div>

        {/* Card principal */}
        <div className="card bg-surface-300 border-white/8 p-6">

          {bootLoading && (
            <div className="py-10 text-center">
              <Loader2 className="animate-spin h-6 w-6 text-brand-500 mx-auto" />
              <p className="text-gray-500 text-sm mt-3">Cargando empresa...</p>
            </div>
          )}

          {!bootLoading && step === 'company' && (
            <form onSubmit={handleCompanySubmit} className="animate-fade-in">
              <h2 className="font-syne text-lg font-semibold text-white mb-1">
                Código de empresa
              </h2>
              <p className="text-gray-500 text-sm mb-4">
                Ingresa el código que te entregó tu proveedor (o abre el link de tu empresa).
              </p>
              <input
                type="text"
                value={slugInput}
                onChange={e => setSlugInput(e.target.value)}
                placeholder="ej: pirotecnia-el-coheton"
                autoFocus
                className="w-full px-4 py-3 rounded-xl bg-surface-400 border-2 border-white/10 text-white placeholder-gray-600 focus:border-brand-500 focus:outline-none"
              />
              <button
                type="submit"
                disabled={!slugInput.trim()}
                className="btn btn-primary btn-lg w-full mt-5"
              >
                Continuar
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          )}

          {/* ---- Paso 1: Seleccionar punto de venta ---- */}
          {!bootLoading && step === 'location' && (
            <div className="animate-fade-in">
              <h2 className="font-syne text-lg font-semibold text-white mb-1">
                Selecciona tu punto de venta
              </h2>
              <p className="text-gray-500 text-sm mb-4">¿En cuál estación vas a trabajar hoy?</p>

              <LocationSelector locations={locations} value={location} onChange={setLocation} />

              <button
                type="button"
                onClick={handleChangeCompany}
                className="text-xs text-gray-600 hover:text-gray-400 transition-colors mt-3 w-full text-center"
              >
                Cambiar de empresa
              </button>

              <button
                onClick={handleLocationNext}
                disabled={!location}
                className="btn btn-primary btn-lg w-full mt-5"
              >
                Continuar
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* ---- Paso 2: Ingresar PIN ---- */}
          {!bootLoading && step === 'pin' && (
            <div className="animate-fade-in">
              <button
                onClick={() => { setStep('location'); setPin('') }}
                className="flex items-center gap-1.5 text-gray-500 hover:text-white text-sm mb-4 transition-colors"
              >
                <ArrowLeft className="w-4 h-4" /> <span>{location?.name}</span>
              </button>

              <h2 className="font-syne text-lg font-semibold text-white mb-1 text-center">
                Ingresa tu PIN
              </h2>
              <p className="text-gray-500 text-sm mb-5 text-center">4 dígitos</p>

              <NumPad
                value={pin}
                onChange={setPin}
                onSubmit={handleLogin}
                loading={loading}
              />

              <button
                onClick={() => handleLogin()}
                disabled={pin.length !== 4 || loading}
                className="btn btn-primary btn-lg w-full mt-5"
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="animate-spin h-4 w-4" />
                    Verificando...
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4" />
                    Ingresar
                  </span>
                )}
              </button>
            </div>
          )}

          {/* ---- Paso 3: Seleccionar caja (solo cajeros) ---- */}
          {!bootLoading && step === 'register' && (
            <div className="animate-fade-in">
              <button
                onClick={() => { setStep('pin'); setPin(''); setSelectedReg(null) }}
                className="flex items-center gap-1.5 text-gray-500 hover:text-white text-sm mb-4 transition-colors"
              >
                <ArrowLeft className="w-4 h-4" /> <span>Cambiar PIN</span>
              </button>

              <h2 className="font-syne text-lg font-semibold text-white mb-1 text-center">
                Selecciona tu caja
              </h2>
              <p className="text-gray-500 text-sm mb-4 text-center">
                ¿En cuál caja vas a cobrar?
              </p>

              <RegisterSelector
                locationId={location?.id}
                value={selectedReg}
                onChange={setSelectedReg}
              />

              <button
                onClick={handleRegisterNext}
                disabled={!selectedReg}
                className="btn btn-primary btn-lg w-full mt-5"
              >
                Entrar a {selectedReg?.name || 'Caja'}
                <ArrowRight className="w-4 h-4" />
              </button>

              <button
                onClick={handleSkipRegister}
                className="text-xs text-gray-600 hover:text-gray-400 transition-colors mt-3 w-full text-center"
              >
                Continuar sin seleccionar caja
              </button>
            </div>
          )}

        </div>

        <p className="text-center text-gray-700 text-xs mt-4">
          PyroVenta · Multitenant
        </p>
      </div>
    </div>
  )
}
