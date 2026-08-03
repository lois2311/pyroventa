import { formatCOP, TRANSFER_PROVIDERS } from '../lib/format.js'

// Las cobradas antes de que existiera el campo no tienen proveedor
const ROWS = [
  ...TRANSFER_PROVIDERS,
  { id: 'sin_detalle', label: 'Sin especificar' },
]

/**
 * Columnas del desglose para las hojas de Excel. Vacío si falta la migración,
 * así el export no gana columnas en blanco que parezcan ventas en cero.
 */
export function transferColumns(data) {
  if (!data) return {}
  return Object.fromEntries(ROWS.map(r => [`Transf. ${r.label}`, Number(data[r.id] || 0)]))
}

/**
 * Desglose de las transferencias por billetera/banco.
 * No renderiza nada si falta la migración (`data` null) o si no hubo
 * transferencias en el rango: un bloque en ceros solo agrega ruido.
 *
 * `compact` lo deja en una línea de chips, para los modales de detalle.
 */
export default function TransferBreakdown({ data, compact = false }) {
  if (!data) return null

  const rows = ROWS
    .map(r => ({ ...r, value: Number(data[r.id] || 0) }))
    .filter(r => r.value > 0)
  if (!rows.length) return null

  const total = rows.reduce((s, r) => s + r.value, 0)

  if (compact) {
    return (
      <div className="flex flex-wrap gap-1.5 mt-1.5">
        {rows.map(r => (
          <span key={r.id} className="text-[10px] bg-blue-500/10 text-blue-300 px-2 py-0.5 rounded-full">
            {r.label}: {formatCOP(r.value)}
          </span>
        ))}
      </div>
    )
  }

  return (
    <div className="mt-2 ml-6 space-y-1.5 border-l border-blue-500/20 pl-3">
      {rows.map(r => {
        const pct = total > 0 ? (r.value / total) * 100 : 0
        return (
          <div key={r.id}>
            <div className="flex items-center justify-between text-xs">
              <span className={r.id === 'sin_detalle' ? 'text-gray-500 italic' : 'text-gray-400'}>
                {r.label}
              </span>
              <span className="font-mono text-blue-300">
                {formatCOP(r.value)}
                <span className="text-gray-600 ml-1.5">{pct.toFixed(0)}%</span>
              </span>
            </div>
            <div className="h-1 bg-surface-50 rounded-full overflow-hidden mt-0.5">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  r.id === 'sin_detalle' ? 'bg-gray-600' : 'bg-blue-400/70'
                }`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}
