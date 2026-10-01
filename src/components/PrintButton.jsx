import { useState, useRef, useEffect } from 'react'
import { ChevronDown, FileDown, Globe, Loader2, Printer } from 'lucide-react'
import { useAuthStore } from '../store/authStore.js'
import { printReceipt, printBrowserFallback, generatePDF } from '../lib/printService.js'
import { useToast } from './Toast.jsx'
import Kbd from './Kbd.jsx'
import { isTypingTarget } from '../lib/device.js'

const METHOD_LABELS = { qz: 'impresora térmica', browser: 'navegador', pdf: 'PDF' }

/**
 * `shortcutKey` (p. ej. "p"): esa tecla imprime con el método automático, sin
 * abrir el menú. Dentro del menú, ↑/↓ recorren las opciones.
 */
export default function PrintButton({ invoice, shortcutKey }) {
  const { location } = useAuthStore()
  const { success, error, info } = useToast()
  const [open,    setOpen]    = useState(false)
  const [loading, setLoading] = useState(false)
  const menuRef = useRef(null)
  const doPrintRef = useRef(null)

  const printerConfig = location?.printer_config || {}

  // Cerrar dropdown al hacer click fuera del menú
  useEffect(() => {
    if (!open) return
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    // Escape cierra el menú sin cerrar el diálogo que lo contiene; ↑/↓, Inicio
    // y Fin recorren las opciones
    const handleKey = (e) => {
      if (e.key === 'Escape') { e.stopImmediatePropagation(); setOpen(false); return }
      const options = [...(menuRef.current?.querySelectorAll('[role="menuitem"]') || [])]
      if (!options.length || !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return
      e.preventDefault()
      const idx = options.indexOf(document.activeElement)
      const next = e.key === 'Home' ? 0
        : e.key === 'End' ? options.length - 1
        : (idx + (e.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length
      options[next].focus()
    }
    // Al abrir, el foco pasa a la primera opción
    menuRef.current?.querySelector('[role="menuitem"]')?.focus()
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKey, true)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKey, true)
    }
  }, [open])

  const doPrint = async (method) => {
    setLoading(true)
    setOpen(false)
    try {
      if (method === 'auto') {
        const used = await printReceipt(invoice, printerConfig)
        success(`Recibo impreso (${METHOD_LABELS[used] || used}).`)
      } else if (method === 'browser') {
        printBrowserFallback(invoice, printerConfig)
        info('Abriendo la impresión del navegador…')
      } else if (method === 'pdf') {
        await generatePDF(invoice, printerConfig)
        success('PDF del recibo descargado.')
      }
    } catch (err) {
      console.error('[print]', err)
      error('No se pudo imprimir. Revisa que la impresora esté encendida y conectada, o descarga el PDF.')
    } finally {
      setLoading(false)
    }
  }
  doPrintRef.current = { doPrint, loading }

  useEffect(() => {
    if (!shortcutKey) return
    const onKey = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat || isTypingTarget(e.target)) return
      if (e.key.toLowerCase() !== shortcutKey.toLowerCase() || doPrintRef.current.loading) return
      e.preventDefault()
      doPrintRef.current.doPrint('auto')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [shortcutKey])

  return (
    <div className="relative inline-block" ref={menuRef}>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen(o => !o) }}
        disabled={loading}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-keyshortcuts={shortcutKey ? shortcutKey.toUpperCase() : undefined}
        className="btn-outline gap-2"
      >
        {loading
          ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          : <Printer className="h-4 w-4" aria-hidden="true" />}
        Imprimir recibo
        {shortcutKey && <Kbd>{shortcutKey.toUpperCase()}</Kbd>}
        <ChevronDown className={`h-3.5 w-3.5 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Opciones de impresión"
          className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-56 bg-surface-200 border border-white/10 rounded-lg overflow-hidden z-[60] animate-fade-in"
        >
          <PrintOption
            Icon={Printer}
            label="Impresora térmica"
            desc="Vía QZ Tray"
            onClick={() => doPrint('auto')}
          />
          <PrintOption
            Icon={Globe}
            label="Imprimir en navegador"
            desc="Ventana del sistema"
            onClick={() => doPrint('browser')}
          />
          <PrintOption
            Icon={FileDown}
            label="Descargar PDF"
            desc="Guardar como archivo"
            onClick={() => doPrint('pdf')}
          />
        </div>
      )}
    </div>
  )
}

function PrintOption({ Icon, label, desc, onClick }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={(e) => { e.stopPropagation(); onClick() }}
      className="press w-full min-h-[var(--control-h)] flex items-start gap-3 px-4 py-3 hover:bg-surface-50 focus:outline-none focus-visible:bg-surface-50 transition-colors text-left"
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" aria-hidden="true" />
      <div>
        <p className="text-sm text-white font-medium">{label}</p>
        <p className="text-xs text-gray-400">{desc}</p>
      </div>
    </button>
  )
}
