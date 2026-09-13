import { ArrowRightLeft, Banknote, CreditCard } from 'lucide-react'
import { formatCOP } from '../lib/format.js'

const METHODS = [
  { key: 'cash',     label: 'Efectivo',      Icon: Banknote,       classes: 'bg-green-500/20  text-green-400'  },
  { key: 'transfer', label: 'Transferencia', Icon: ArrowRightLeft, classes: 'bg-blue-500/20   text-blue-400'   },
  { key: 'card',     label: 'Datáfono',      Icon: CreditCard,     classes: 'bg-violet-500/20 text-violet-400' },
]

const SIZE_CLASSES = {
  sm: 'text-[10px] px-1.5 py-0.5 gap-0.5',
  md: 'text-xs px-2 py-1 gap-1',
}

/**
 * Chips de desglose por método de pago — mismo mapeo de color e iconos en
 * todo el proyecto (verde=efectivo, azul=transferencia, violeta=tarjeta),
 * antes duplicado byte a byte en 4 componentes distintos.
 * `withLabel` muestra "Efectivo: $x" (encabezados de modal); si no, solo el monto (listas densas).
 */
export default function PaymentMethodChips({ byMethod, size = 'sm', withLabel = false }) {
  if (!byMethod) return null
  const iconSize = size === 'md' ? 'w-3.5 h-3.5' : 'w-2.5 h-2.5'

  return (
    <div className="flex flex-wrap gap-1.5">
      {METHODS.map(({ key, label, Icon, classes }) => {
        const val = byMethod[key] || 0
        if (val <= 0) return null
        return (
          <span
            key={key}
            className={`rounded-lg font-mono inline-flex items-center ${SIZE_CLASSES[size]} ${classes}`}
          >
            <Icon className={iconSize} /> {withLabel ? `${label}: ` : ''}{formatCOP(val)}
          </span>
        )
      })}
    </div>
  )
}
