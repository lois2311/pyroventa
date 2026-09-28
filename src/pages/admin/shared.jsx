// Piezas compartidas por las pestañas de gestión de Administración.

/** Grilla de tarjetas de las pestañas de gestión: 1 → 2 → 3 columnas. */
export const CARD_GRID = 'grid gap-3 sm:grid-cols-2 2xl:grid-cols-3'

/** Iniciales en círculo: identifica a la persona sin depender de una foto. */
export function Initials({ name }) {
  const initials = String(name || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase()
  return (
    <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-50 text-sm font-semibold text-gray-300">
      {initials}
    </span>
  )
}

export function SkeletonGrid({ count = 3, height = 'h-32' }) {
  return (
    <div className={CARD_GRID}>
      {Array.from({ length: count }).map((_, i) => <div key={i} className={`skeleton rounded-xl ${height}`} />)}
    </div>
  )
}

/** Error de servidor dentro de un formulario (arriba del pie del modal). */
export function FormError({ message }) {
  if (!message) return null
  return (
    <p role="alert" className="rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-sm text-red-300">
      {message}
    </p>
  )
}
