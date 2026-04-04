import { useEffect, useState } from 'react'
import { CheckCircle2, MapPin, RotateCcw } from 'lucide-react'
import { api } from '../lib/api.js'

export default function LocationSelector({ value, onChange }) {
  const [locations, setLocations] = useState([])
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState(null)

  useEffect(() => {
    api.get('/locations')
      .then(data => setLocations((data || []).filter(l => l.active !== false)))
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {[1, 2, 3].map(i => (
          <div key={i} className="skeleton h-20 rounded-xl" />
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-center py-8">
        <p className="text-red-400 text-sm">{error}</p>
        <button className="btn btn-ghost btn-sm mt-2" onClick={() => window.location.reload()}>
          <RotateCcw className="w-4 h-4" />
          Reintentar
        </button>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {locations.map(loc => (
        <button
          key={loc.id}
          onClick={() => onChange(loc)}
          className={`
            text-left p-4 rounded-xl border-2 transition-all duration-150 cursor-pointer
            ${value?.id === loc.id
              ? 'bg-brand-500/20 border-brand-500 text-white'
              : 'bg-surface-300 border-white/10 text-gray-300 hover:border-brand-500/50 hover:bg-surface-200'
            }
          `}
        >
          <div className="flex items-start gap-3">
            <MapPin className="w-5 h-5 mt-0.5 text-brand-500" />
            <div className="min-w-0">
              <p className="font-semibold text-white truncate">{loc.name}</p>
              {loc.address && (
                <p className="text-xs text-gray-500 mt-0.5 truncate">{loc.address}</p>
              )}
            </div>
            {value?.id === loc.id && (
              <CheckCircle2 className="ml-auto text-brand-500 w-5 h-5 shrink-0" />
            )}
          </div>
        </button>
      ))}
    </div>
  )
}
