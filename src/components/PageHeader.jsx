/**
 * Encabezado de vista: título + descripción a la izquierda, acciones a la
 * derecha (debajo en móvil). Todas las pestañas de Administración y el panel
 * de plataforma lo usan, así el título, el botón "Nuevo" y los filtros caen
 * siempre en el mismo lugar.
 */
export default function PageHeader({ title, description, icon: Icon, actions, className = '' }) {
  return (
    <header className={`flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between ${className}`}>
      <div className="min-w-0">
        <h1 className="page-title">
          {Icon && <Icon className="w-5 h-5 shrink-0 text-brand-400 sm:w-6 sm:h-6" />}
          <span className="min-w-0">{title}</span>
        </h1>
        {description && <p className="mt-1 max-w-prose text-sm text-gray-400">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  )
}

/** Encabezado de sección dentro de una vista (h2), con acciones opcionales. */
export function SectionHeader({ title, description, icon: Icon, actions, className = '' }) {
  return (
    <div className={`mb-3 flex flex-wrap items-end justify-between gap-x-4 gap-y-2 ${className}`}>
      <div className="min-w-0">
        <h2 className="section-title">
          {Icon && <Icon className="w-4 h-4 shrink-0 text-gray-400" />}
          <span className="min-w-0">{title}</span>
        </h2>
        {description && <p className="mt-0.5 text-xs text-gray-400">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}
