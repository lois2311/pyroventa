import { useState, useRef, useEffect } from 'react'
import { ChevronDown, FileDown, Globe, Loader2, Printer } from 'lucide-react'
import { useAuthStore } from '../store/authStore.js'
import { printReceipt, printBrowserFallback, generatePDF } from '../lib/printService.js'
import { useToast } from './Toast.jsx'

const METHOD_LABELS = { qz: 'Impresora térmica', browser: 'Navegador', pdf: 'PDF' }

export default function PrintButton({ invoice }) {
  const { location } = useAuthStore()
  const { success, error, info } = useToast()
  const [open,    setOpen]    = useState(false)
  const [loading, setLoading] = useState(false)
  const menuRef = useRef(null)

  const printerConfig = location?.printer_config || {}

  // Cerrar dropdown al hacer click fuera del menú
  useEffect(() => {
    if (!open) return
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    // Escape cierra el menú sin cerrar el diálogo que lo contiene
    const handleKey = (e) => {
      if (e.key === 'Escape') { e.stopImmediatePropagation(); setOpen(false) }
    }
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
        success(`Impreso via ${METHOD_LABELS[used] || used}`)
      } else if (method === 'browser') {
        printBrowserFallback(invoice, printerConfig)
        info('Imprimiendo desde el navegador...')
      } else if (method === 'pdf') {
        await generatePDF(invoice, printerConfig)
        success('PDF descargado')
      }
    } catch (err) {
      error(`Error al imprimir: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative inline-block" ref={menuRef}>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen(o => !o) }}
        disabled={loading}
        aria-expanded={open}
        aria-haspopup="true"
        className="btn-outline gap-2"
      >
        {loading
          ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          : <Printer className="h-4 w-4" aria-hidden="true" />}
        Imprimir recibo
        <ChevronDown className={`h-3.5 w-3.5 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>

      {open && (
        <div
          role="group"
          aria-label="Opciones de impresión"
          className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-56 bg-surface-200 border border-white/10 rounded-xl overflow-hidden z-[60] animate-slide-up"
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
      onClick={(e) => { e.stopPropagation(); onClick() }}
      className="w-full flex items-start gap-3 px-4 py-3 hover:bg-surface-50 focus-visible:bg-surface-50 transition-colors text-left"
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" aria-hidden="true" />
      <div>
        <p className="text-sm text-white font-medium">{label}</p>
        <p className="text-xs text-gray-400">{desc}</p>
      </div>
    </button>
  )
}
