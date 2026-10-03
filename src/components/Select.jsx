import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown } from 'lucide-react'

const MAX_H = 288 // 18rem
const GAP = 4

/**
 * Select propio, sustituto de `<select>` con la misma semántica de formulario:
 * `<label htmlFor={id}>` lo etiqueta y `aria-invalid` / `aria-describedby`
 * pasan al disparador.
 *
 * - `options`: [{ value, label, hint?, disabled? }] (value siempre string).
 * - `onChange(value)`: recibe el valor, no el evento.
 * - `variant="bare"`: sin caja de `.input`, para controles dentro de otra
 *   cápsula (Topbar); el estilo lo pone `className`.
 *
 * Teclado (patrón select-only combobox): Enter/Espacio/↓/↑ abren; flechas,
 * Inicio/Fin y teclear la primera letra mueven; Enter elige; Escape cierra
 * SIN cerrar el modal que lo contenga (el foco nunca sale del disparador, así
 * la trampa de Tab del modal sigue funcionando). La lista va en un portal con
 * posición fija para no recortarse dentro de modales con scroll.
 */
export default function Select({
  id,
  value,
  onChange,
  options,
  placeholder = 'Seleccionar…',
  disabled = false,
  variant = 'field',
  className = '',
  listClassName = '',
  ...rest
}) {
  const autoId = useId()
  const triggerId = id || `${autoId}-trigger`
  const listId = `${autoId}-list`
  const triggerRef = useRef(null)
  const listRef = useRef(null)
  const typed = useRef({ text: '', timer: 0 })
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const [pos, setPos] = useState(null)

  const selectedIdx = useMemo(() => options.findIndex(o => o.value === value), [options, value])
  const selected = options[selectedIdx]

  const place = useCallback(() => {
    const el = triggerRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const below = window.innerHeight - r.bottom - GAP
    const above = r.top - GAP
    const flip = below < Math.min(MAX_H, 160) && above > below
    const maxHeight = Math.min(MAX_H, (flip ? above : below) - 8)
    setPos({
      left: r.left,
      minWidth: r.width,
      maxHeight,
      ...(flip ? { bottom: window.innerHeight - r.top + GAP } : { top: r.bottom + GAP }),
    })
  }, [])

  const enabled = (i) => i >= 0 && i < options.length && !options[i].disabled
  const step = (from, dir) => {
    let i = from
    do { i += dir } while (i >= 0 && i < options.length && options[i].disabled)
    return enabled(i) ? i : from
  }

  const openList = () => {
    if (disabled) return
    setActive(enabled(selectedIdx) ? selectedIdx : step(-1, 1))
    setOpen(true)
  }
  const close = () => setOpen(false)
  const pick = (i) => {
    if (!enabled(i)) return
    if (options[i].value !== value) onChange(options[i].value)
    close()
  }

  useLayoutEffect(() => { if (open) place() }, [open, place])

  // Cierra al tocar fuera; reubica con resize/scroll del contenedor (modal con
  // scroll) pero no con el scroll de la propia lista.
  useEffect(() => {
    if (!open) return
    const onDown = (e) => {
      if (triggerRef.current?.contains(e.target) || listRef.current?.contains(e.target)) return
      close()
    }
    const onScroll = (e) => { if (!listRef.current?.contains(e.target)) place() }
    document.addEventListener('pointerdown', onDown)
    window.addEventListener('resize', place)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [open, place])

  // Mantiene la opción activa a la vista.
  useEffect(() => {
    if (open && pos) listRef.current?.querySelector(`[data-i="${active}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [open, active, pos])

  useEffect(() => () => clearTimeout(typed.current.timer), [])

  const onKeyDown = (e) => {
    if (disabled || e.altKey || e.ctrlKey || e.metaKey) return
    const k = e.key
    if (!open) {
      if (k === 'Enter' || k === ' ' || k === 'ArrowDown' || k === 'ArrowUp') { e.preventDefault(); openList() }
      return
    }
    if (k === 'Escape') { e.preventDefault(); e.stopPropagation(); close() }
    else if (k === 'Tab') close()
    else if (k === 'ArrowDown') { e.preventDefault(); setActive(a => step(a, 1)) }
    else if (k === 'ArrowUp') { e.preventDefault(); setActive(a => step(a, -1)) }
    else if (k === 'Home') { e.preventDefault(); setActive(step(-1, 1)) }
    else if (k === 'End') { e.preventDefault(); setActive(step(options.length, -1)) }
    else if (k === 'Enter' || k === ' ') { e.preventDefault(); pick(active) }
    else if (k.length === 1) {
      // Typeahead: acumula letras 500 ms y salta a la primera opción que empiece así.
      const t = typed.current
      clearTimeout(t.timer)
      t.text += k.toLowerCase()
      t.timer = setTimeout(() => { t.text = '' }, 500)
      const from = t.text.length > 1 ? active : active + 1
      const order = [...options.keys()].map((_, n) => (from + n) % options.length)
      const hit = order.find(i => enabled(i) && String(options[i].label).toLowerCase().startsWith(t.text))
      if (hit !== undefined) setActive(hit)
    }
  }

  const base = variant === 'bare'
    ? 'flex items-center gap-2 text-left'
    : 'input flex cursor-pointer focus-visible:outline-none items-center justify-between gap-2 text-left'

  return (
    <>
      <button
        {...rest}
        ref={triggerRef}
        id={triggerId}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open && active >= 0 ? `${listId}-${active}` : undefined}
        disabled={disabled}
        onClick={() => (open ? close() : openList())}
        onKeyDown={onKeyDown}
        onBlur={close}
        className={`${base} ${className}`}
      >
        <span className={`min-w-0 flex-1 truncate ${selected ? '' : 'text-gray-400'}`}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown
          aria-hidden="true"
          className={`h-4 w-4 shrink-0 text-gray-400 transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && pos && createPortal(
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          aria-labelledby={triggerId}
          // Evita que el mousedown robe el foco al disparador (y dispare su onBlur).
          onMouseDown={e => e.preventDefault()}
          style={pos}
          className={`fixed z-[9990] overflow-y-auto overscroll-contain rounded-lg border border-white/10 bg-surface-200 p-1 shadow-xl shadow-black/40 animate-fade-in ${listClassName}`}
        >
          {options.map((o, i) => {
            const isSel = i === selectedIdx
            return (
              <li
                key={o.value}
                id={`${listId}-${i}`}
                data-i={i}
                role="option"
                aria-selected={isSel}
                aria-disabled={o.disabled || undefined}
                onClick={() => pick(i)}
                onMouseMove={() => { if (active !== i && !o.disabled) setActive(i) }}
                className={`flex min-h-[2.75rem] cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm sm:min-h-[2.25rem] ${
                  o.disabled ? 'cursor-not-allowed opacity-40'
                    : i === active ? 'bg-surface-50 text-white'
                    : 'text-gray-300'
                } ${isSel ? 'font-medium text-white' : ''}`}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{o.label}</span>
                  {o.hint && <span className="block truncate text-xs text-gray-400">{o.hint}</span>}
                </span>
                {isSel && <Check aria-hidden="true" className="h-4 w-4 shrink-0 text-brand-400" />}
              </li>
            )
          })}
        </ul>,
        document.body,
      )}
    </>
  )
}
