/**
 * Estado vacío uniforme: ícono en círculo, mensaje, ayuda y acciones.
 * Reemplaza los "Sin datos" en texto suelto y los emoji gigantes que cada
 * lista resolvía a su manera.
 */
export default function EmptyState({ icon: Icon, title, description, action, compact = false, className = '' }) {
  return (
    <div className={`flex flex-col items-center justify-center rounded-xl border border-dashed border-white/10 text-center ${compact ? 'px-4 py-6' : 'px-6 py-10'} ${className}`}>
      {Icon && (
        <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-surface-50 text-gray-400">
          <Icon className="w-5 h-5" />
        </span>
      )}
      <p className="text-sm font-medium text-gray-200">{title}</p>
      {description && <p className="mt-1 max-w-sm text-xs text-gray-400">{description}</p>}
      {action && <div className="mt-4 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  )
}
