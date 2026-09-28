import { useId } from 'react'

// Selector de rango con atajos. Fechas en hora local del dispositivo (Colombia).
export const toISO = (d) => {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

const PRESETS = [
  { days: 1,  label: 'Hoy' },
  { days: 7,  label: '7 días' },
  { days: 30, label: '30 días' },
]

const rangeFor = (days) => {
  const end = new Date()
  const start = new Date()
  start.setDate(start.getDate() - (days - 1))
  return [toISO(start), toISO(end)]
}

/**
 * Desde / Hasta + atajos en un control segmentado. El atajo que coincide con
 * el rango actual queda marcado (aria-pressed), así se sabe de un vistazo si
 * se está viendo "hoy" o un rango personalizado.
 */
export default function DateRangeBar({ from, to, onChange }) {
  const id = useId()
  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="grid w-full grid-cols-2 gap-3 sm:w-auto">
        <div>
          <label htmlFor={`${id}-from`} className="field-label">Desde</label>
          <input id={`${id}-from`} type="date" value={from} max={to}
            onChange={e => onChange(e.target.value, to < e.target.value ? e.target.value : to)}
            className="input sm:w-40" />
        </div>
        <div>
          <label htmlFor={`${id}-to`} className="field-label">Hasta</label>
          <input id={`${id}-to`} type="date" value={to} min={from}
            onChange={e => onChange(from > e.target.value ? e.target.value : from, e.target.value)}
            className="input sm:w-40" />
        </div>
      </div>
      <div className="segmented w-full sm:w-auto [&>button]:flex-1 sm:[&>button]:flex-none" role="group" aria-label="Rango rápido">
        {PRESETS.map(p => {
          const [f, t] = rangeFor(p.days)
          return (
            <button key={p.days} type="button" aria-pressed={from === f && to === t} onClick={() => onChange(f, t)}>
              {p.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
