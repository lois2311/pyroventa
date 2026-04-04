import { useState, useRef, useEffect } from 'react'
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
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
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
        onClick={(e) => { e.stopPropagation(); setOpen(o => !o) }}
        disabled={loading}
        className="btn btn-ghost border border-white/10 gap-2"
      >
        {loading ? (
          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
          </svg>
        ) : (
          <span>🖨</span>
        )}
        Imprimir recibo
        <span className="text-gray-600">▾</span>
      </button>

      {open && (
        <div
          className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-56 bg-surface-200 border border-white/10 rounded-xl shadow-2xl overflow-hidden z-[60] animate-slide-up"
          onClick={e => e.stopPropagation()}
        >
          <PrintOption
            icon="🖨"
            label="Impresora térmica"
            desc="Via QZ Tray"
            onClick={() => doPrint('auto')}
          />
          <PrintOption
            icon="🌐"
            label="Imprimir en navegador"
            desc="Ventana del sistema"
            onClick={() => doPrint('browser')}
          />
          <PrintOption
            icon="📄"
            label="Descargar PDF"
            desc="Guardar como archivo"
            onClick={() => doPrint('pdf')}
          />
        </div>
      )}
    </div>
  )
}

function PrintOption({ icon, label, desc, onClick }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick() }}
      className="w-full flex items-start gap-3 px-4 py-3 hover:bg-surface-50 transition-colors text-left"
    >
      <span className="text-lg mt-0.5">{icon}</span>
      <div>
        <p className="text-sm text-white font-medium">{label}</p>
        <p className="text-xs text-gray-500">{desc}</p>
      </div>
    </button>
  )
}
