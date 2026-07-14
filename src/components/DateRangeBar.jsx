// Selector de rango con atajos. Fechas en hora local del dispositivo (Colombia).
export const toISO = (d) => {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export default function DateRangeBar({ from, to, onChange }) {
  const setQuick = (days) => {
    const end = new Date()
    const start = new Date()
    start.setDate(start.getDate() - (days - 1))
    onChange(toISO(start), toISO(end))
  }

  return (
    <div className="flex items-end gap-3 flex-wrap">
      <div>
        <label className="block text-xs text-gray-400 mb-1">Desde</label>
        <input type="date" value={from} max={to}
          onChange={e => onChange(e.target.value, to < e.target.value ? e.target.value : to)}
          className="input w-40 text-sm" />
      </div>
      <div>
        <label className="block text-xs text-gray-400 mb-1">Hasta</label>
        <input type="date" value={to} min={from}
          onChange={e => onChange(from > e.target.value ? e.target.value : from, e.target.value)}
          className="input w-40 text-sm" />
      </div>
      <div className="flex gap-1.5">
        <button onClick={() => setQuick(1)}  className="btn btn-ghost btn-sm border border-white/10">Hoy</button>
        <button onClick={() => setQuick(7)}  className="btn btn-ghost btn-sm border border-white/10">7 días</button>
        <button onClick={() => setQuick(30)} className="btn btn-ghost btn-sm border border-white/10">30 días</button>
      </div>
    </div>
  )
}
