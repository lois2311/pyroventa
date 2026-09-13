import { Award } from 'lucide-react'

// Oro/plata/bronce como acento de color real, no emoji de medalla —
// mismo lenguaje de iconos que el resto del dashboard (lucide-react).
const TOP_STYLES = [
  'bg-brand-500/15 border-brand-500/40 text-brand-400',
  'bg-white/10 border-white/20 text-gray-200',
  'bg-orange-900/30 border-orange-700/40 text-orange-400',
]

export default function RankBadge({ rank }) {
  const idx = rank - 1
  const isTop3 = idx >= 0 && idx < 3

  if (isTop3) {
    return (
      <div className={`w-8 h-8 rounded-full border flex items-center justify-center shrink-0 ${TOP_STYLES[idx]}`}>
        <Award className="w-4 h-4" />
      </div>
    )
  }

  return (
    <div className="w-8 h-8 rounded-full border border-white/10 bg-surface-50 flex items-center justify-center shrink-0">
      <span className="text-xs font-mono font-bold text-gray-400">{rank}</span>
    </div>
  )
}
