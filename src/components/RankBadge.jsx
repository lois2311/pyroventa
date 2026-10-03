// Posición en un ranking: insignia numérica compacta. Los tres primeros llevan
// un acento (Voltaje / plata / bronce); el resto, neutro.
const TOP_STYLES = [
  'border-brand-500/50 bg-brand-500/15 text-brand-300',
  'border-white/25 bg-white/10 text-gray-100',
  'border-orange-700/50 bg-orange-900/30 text-orange-300',
]

export default function RankBadge({ rank }) {
  const accent = TOP_STYLES[rank - 1] || 'border-white/10 bg-surface-50 text-gray-400'
  return (
    <span className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border font-mono text-xs font-bold tabular-nums ${accent}`}>
      {rank}
    </span>
  )
}
