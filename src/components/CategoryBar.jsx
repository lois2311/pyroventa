import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, LayoutGrid, Sparkles } from 'lucide-react'
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion.js'

const SMALL_WORDS = new Set(['de', 'del', 'la', 'las', 'el', 'los', 'y', 'e', 'o', 'con', 'para', 'en', 'a'])

/** "VOLCANES y fuentes" → "Volcanes y Fuentes". Solo presentación: el dato no se toca. */
export function titleCase(name = '') {
  return String(name).toLowerCase().split(/(\s+)/).map((w, i) => (
    !w.trim() || (i > 0 && SMALL_WORDS.has(w)) ? w : w.charAt(0).toUpperCase() + w.slice(1)
  )).join('')
}

function Chip({ active, onClick, label, icon, className = '' }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active} className={`chip press ${className}`}>
      {icon && <span aria-hidden="true">{icon}</span>}
      <span className="truncate">{label}</span>
    </button>
  )
}

const EDGE = 'pointer-events-none absolute inset-y-0 z-10 flex w-12 items-center'
const ARROW = 'pointer-events-auto flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-surface-300 text-gray-300 shadow-md transition-colors hover:text-white'

/**
 * Barra de categorías del POS: carrusel horizontal con rueda del ratón,
 * flechas y degradado solo cuando hay más a ese lado, auto-scroll al chip
 * activo y un menú "Todas (N)" para saltar a cualquier categoría sin desplazar.
 *
 * `value` es el id activo o 'all'; `onChange(id)` recibe el id o 'all'.
 */
export default function CategoryBar({ categories, value, onChange, className = '' }) {
  const scrollerRef = useRef(null)
  const menuRef = useRef(null)
  const menuId = useId()
  const reduced = usePrefersReducedMotion()
  const [edges, setEdges] = useState({ left: false, right: false })
  const [menuOpen, setMenuOpen] = useState(false)

  const measure = useCallback(() => {
    const el = scrollerRef.current
    if (!el) return
    const left = el.scrollLeft > 1
    const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 1
    setEdges(e => (e.left === left && e.right === right ? e : { left, right }))
  }, [])

  useEffect(() => {
    const el = scrollerRef.current
    if (!el) return
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    // Rueda vertical → desplazamiento horizontal. Listener nativo no pasivo:
    // el onWheel de React es pasivo y no puede cancelar el scroll de la página.
    const onWheel = (e) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return // trackpad horizontal: ya funciona
      const max = el.scrollWidth - el.clientWidth
      if (max <= 0 || (e.deltaY < 0 && el.scrollLeft <= 0) || (e.deltaY > 0 && el.scrollLeft >= max)) return
      e.preventDefault()
      el.scrollLeft += e.deltaY
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => { ro.disconnect(); el.removeEventListener('wheel', onWheel) }
  }, [measure, categories])

  // El chip activo siempre queda a la vista (también al elegirlo desde el menú).
  useEffect(() => {
    scrollerRef.current?.querySelector('[aria-pressed="true"]')
      ?.scrollIntoView({ inline: 'nearest', block: 'nearest', behavior: reduced ? 'auto' : 'smooth' })
  }, [value, reduced])

  useEffect(() => {
    if (!menuOpen) return
    const onDown = (e) => { if (!menuRef.current?.contains(e.target)) setMenuOpen(false) }
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); setMenuOpen(false) } }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey, true)
    menuRef.current?.querySelector('[aria-pressed="true"]')?.focus()
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey, true)
    }
  }, [menuOpen])

  const nudge = (dir) => scrollerRef.current?.scrollBy({ left: dir * 200, behavior: reduced ? 'auto' : 'smooth' })
  const pick = (id) => { onChange(id); setMenuOpen(false) }

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className="relative min-w-0 flex-1">
        <div
          ref={scrollerRef}
          onScroll={measure}
          role="group"
          aria-label="Categorías"
          className="flex gap-2 overflow-x-auto scrollbar-hide"
        >
          <Chip active={value === 'all'} onClick={() => onChange('all')} label="Todos" icon={<Sparkles className="h-3.5 w-3.5" />} />
          {categories.map(c => (
            <Chip key={c.id} active={value === c.id} onClick={() => onChange(c.id)} label={titleCase(c.name)} icon={c.icon} />
          ))}
        </div>
        {edges.left && (
          <div className={`${EDGE} left-0 justify-start bg-gradient-to-r from-surface-500 to-transparent`}>
            <button type="button" tabIndex={-1} aria-label="Categorías anteriores" onClick={() => nudge(-1)} className={ARROW}>
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        )}
        {edges.right && (
          <div className={`${EDGE} right-0 justify-end bg-gradient-to-l from-surface-500 to-transparent`}>
            <button type="button" tabIndex={-1} aria-label="Más categorías" onClick={() => nudge(1)} className={ARROW}>
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        )}
      </div>

      {categories.length > 0 && (
        <div ref={menuRef} className="relative shrink-0">
          <button
            type="button"
            onClick={() => setMenuOpen(o => !o)}
            aria-haspopup="true"
            aria-expanded={menuOpen}
            aria-controls={menuOpen ? menuId : undefined}
            className="chip press"
          >
            <LayoutGrid className="h-3.5 w-3.5" aria-hidden="true" />
            Todas ({categories.length})
          </button>
          {menuOpen && (
            <div
              id={menuId}
              role="group"
              aria-label="Todas las categorías"
              className="absolute right-0 top-full z-30 mt-2 grid max-h-80 w-[min(34rem,calc(100vw-2rem))] grid-cols-2 gap-1.5 overflow-y-auto overscroll-contain rounded-lg border border-white/10 bg-surface-200 p-2 shadow-xl shadow-black/40 animate-fade-in sm:grid-cols-3"
            >
              <Chip className="min-w-0 justify-start" active={value === 'all'} onClick={() => pick('all')} label="Todos" icon={<Sparkles className="h-3.5 w-3.5" />} />
              {categories.map(c => (
                <Chip key={c.id} className="min-w-0 justify-start" active={value === c.id} onClick={() => pick(c.id)} label={titleCase(c.name)} icon={c.icon} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
