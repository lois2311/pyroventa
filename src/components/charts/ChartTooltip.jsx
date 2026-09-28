import { formatCOP } from '../../lib/format.js'

/**
 * Tooltip compartido por todos los gráficos de Recharts.
 * - El valor manda (tinta blanca, cifra monoespaciada); el nombre de la serie
 *   va detrás, en gris. El color de la serie solo aparece en la marca.
 * - Cada fila lleva una "línea llave" corta del color de la serie (no una
 *   caja): a esta densidad un bloque de color pesa más que el dato.
 * - Con varias series muestra todas (y el total si showTotal), así el puntero
 *   no tiene que caer justo sobre un segmento.
 *
 * Se pasa como <Tooltip content={<ChartTooltip … />} />: Recharts inyecta
 * active, payload y label.
 */
export default function ChartTooltip({
  active, payload, label,
  title,                       // (label, datum) => string
  valueFormatter = formatCOP,  // (value, entry) => string
  showTotal = false,
  footer,                      // (datum) => ReactNode
}) {
  if (!active || !payload?.length) return null

  const datum = payload[0]?.payload || {}
  const entries = payload.filter(p => p.value != null)
  const total = payload.reduce((n, p) => n + (Number(p.value) || 0), 0)
  const heading = title ? title(label, datum) : label

  return (
    <div className="min-w-[10rem] max-w-[16rem] rounded-lg border border-white/10 bg-surface-100/95 px-3 py-2.5 text-left shadow-xl shadow-black/40 backdrop-blur-sm">
      {heading && <p className="mb-1.5 text-2xs font-medium text-gray-400">{heading}</p>}

      {showTotal && entries.length > 1 && (
        <p className="mb-1.5 flex items-baseline justify-between gap-4 border-b border-white/10 pb-1.5">
          <span className="font-mono text-sm font-semibold tabular-nums text-white">{valueFormatter(total)}</span>
          <span className="text-2xs text-gray-400">Total</span>
        </p>
      )}

      <ul className="space-y-1">
        {entries.map(p => (
          <li key={p.dataKey ?? p.name} className="flex items-center gap-2">
            <span aria-hidden="true" className="h-0.5 w-3 shrink-0 rounded-full" style={{ background: p.color || p.payload?.fill }} />
            <span className="font-mono text-sm font-semibold tabular-nums text-white">{valueFormatter(p.value, p)}</span>
            {(entries.length > 1 || p.name) && <span className="ml-auto pl-3 text-2xs text-gray-400">{p.name}</span>}
          </li>
        ))}
      </ul>

      {footer && <div className="mt-1.5 text-2xs text-gray-400">{footer(datum)}</div>}
    </div>
  )
}
