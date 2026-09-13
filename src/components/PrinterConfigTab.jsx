import { useState, useEffect, useRef } from 'react'
import {
  Printer,
  Upload,
  Trash2,
  Check,
  RefreshCw,
  Image as ImageIcon,
  AlertCircle,
  Eye,
  FileText,
  Sliders,
  CheckCircle2
} from 'lucide-react'
import { api } from '../lib/api.js'
import { useAuthStore } from '../store/authStore.js'
import { useToast } from './Toast.jsx'
import { formatCOP } from '../lib/format.js'
import { printBrowserFallback, generatePDF } from '../lib/printService.js'

export default function PrinterConfigTab({ locations = [], isOwner = false }) {
  const { location: authLocation, updatePrinterConfig } = useAuthStore()
  const { success: toastSuccess, error: toastError, info: toastInfo } = useToast()

  // Selección de sede (owner puede elegir sede o aplicar a todas)
  const defaultLocId = authLocation?.id || locations[0]?.id || ''
  const [selectedLocId, setSelectedLocId] = useState(defaultLocId)
  const [applyToAll, setApplyToAll] = useState(false)

  // Configuración actual
  const [paperWidth, setPaperWidth] = useState('80mm')
  const [printerName, setPrinterName] = useState('POS-80')
  const [useQzTray, setUseQzTray] = useState(false)
  const [headerLines, setHeaderLines] = useState(['PIROTÉCNICA LA CHISPA', 'Venta autorizada de pirotecnia'])
  const [footerLines, setFooterLines] = useState(['¡Gracias por su compra!', 'Manipule con responsabilidad'])
  const [logoUrl, setLogoUrl] = useState('')

  // Estados de carga y subida
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [saving, setSaving] = useState(false)
  const fileInputRef = useRef(null)

  // Cargar config cuando cambia la sede seleccionada
  useEffect(() => {
    const loc = locations.find(l => l.id === selectedLocId) || authLocation
    if (loc?.printer_config) {
      const cfg = loc.printer_config
      setPaperWidth(cfg.paper_width || '80mm')
      setPrinterName(cfg.printer_name || 'POS-80')
      setUseQzTray(cfg.use_qz_tray ?? false)
      setHeaderLines(Array.isArray(cfg.header_lines) && cfg.header_lines.length ? cfg.header_lines : [loc.name || 'MI EMPRESA'])
      setFooterLines(Array.isArray(cfg.footer_lines) && cfg.footer_lines.length ? cfg.footer_lines : ['¡Gracias por su compra!'])
      setLogoUrl(cfg.logo_url || '')
    }
  }, [selectedLocId, locations, authLocation])

  // Subir archivo de imagen para logo
  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      return toastError('Por favor selecciona un archivo de imagen (PNG, JPG o WEBP)')
    }
    if (file.size > 2 * 1024 * 1024) {
      return toastError('La imagen no debe superar los 2MB')
    }

    try {
      setUploadingLogo(true)
      const reader = new FileReader()
      const dataUrl = await new Promise((resolve, reject) => {
        reader.onload = () => resolve(reader.result)
        reader.onerror = reject
        reader.readAsDataURL(file)
      })

      const res = await api.post('/printer/upload-logo', { data: dataUrl })
      if (res?.url) {
        setLogoUrl(res.url)
        toastSuccess('Logo subido correctamente. Recuerda guardar cambios.')
      }
    } catch (err) {
      toastError(err.message || 'Error al subir el logo')
    } finally {
      setUploadingLogo(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleRemoveLogo = () => {
    setLogoUrl('')
    toastInfo('Logo removido. Guarda los cambios para aplicar.')
  }

  // Guardar configuración
  const handleSave = async () => {
    setSaving(true)
    const chars_per_line = paperWidth === '80mm' ? 48 : 32
    const filteredHeaders = headerLines.map(l => l.trim()).filter(Boolean)
    const filteredFooters = footerLines.map(l => l.trim()).filter(Boolean)

    const printer_config = {
      paper_width: paperWidth,
      chars_per_line,
      printer_name: printerName.trim() || 'POS-80',
      use_qz_tray: useQzTray,
      header_lines: filteredHeaders.length ? filteredHeaders : ['MI EMPRESA'],
      footer_lines: filteredFooters.length ? filteredFooters : ['¡Gracias por su compra!'],
      logo_url: logoUrl || null,
    }

    try {
      const payload = applyToAll && isOwner
        ? { all_locations: true, printer_config }
        : { location_id: selectedLocId, printer_config }

      await api.put('/printer/config', payload)

      // Si la sede editada es la activa, actualizar estado en memoria
      if (applyToAll || selectedLocId === authLocation?.id) {
        updatePrinterConfig(printer_config)
      }

      toastSuccess(applyToAll ? 'Configuración guardada para todos los puntos' : 'Configuración de impresora guardada')
    } catch (err) {
      toastError(err.message || 'Error al guardar la configuración')
    } finally {
      setSaving(false)
    }
  }

  // Datos para prueba de impresión
  const sampleInvoice = {
    code: 'TEST-001',
    created_at: new Date().toISOString(),
    seller_name: 'Caja Principal',
    pay_method: 'cash',
    total: 85000,
    items: [
      { productName: 'Volcán Especial Titanio', label: 'Caja x 6', qty: 2, subtotal: 50000 },
      { productName: 'Bengala Chispas Luz Blanca', label: 'Paquete x 12', qty: 1, subtotal: 35000 },
    ],
    observations: 'Ticket de prueba de impresión térmica',
  }

  const currentConfig = {
    paper_width: paperWidth,
    chars_per_line: paperWidth === '80mm' ? 48 : 32,
    printer_name: printerName,
    use_qz_tray: useQzTray,
    header_lines: headerLines.filter(Boolean),
    footer_lines: footerLines.filter(Boolean),
    logo_url: logoUrl || null,
  }

  const handleTestPrintBrowser = () => {
    try {
      printBrowserFallback(sampleInvoice, currentConfig)
    } catch (err) {
      toastError(err.message)
    }
  }

  const handleTestPrintPDF = async () => {
    try {
      await generatePDF(sampleInvoice, currentConfig)
      toastSuccess('PDF de prueba generado')
    } catch (err) {
      toastError(err.message)
    }
  }

  const selectedLocation = locations.find(l => l.id === selectedLocId)

  return (
    <div className="space-y-6">
      {/* Encabezado del tab */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/10 pb-4">
        <div>
          <h2 className="text-lg font-syne font-bold text-white flex items-center gap-2">
            <Printer className="w-5 h-5 text-brand-400" />
            Configuración de Impresión Térmica y Logo
          </h2>
          <p className="text-xs text-gray-400 mt-0.5">
            Personaliza el logo, tamaño de papel (80mm / 58mm) y textos que se imprimen en los recibos térmicos.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || (!selectedLocId && !applyToAll)}
            className="btn btn-primary inline-flex items-center gap-2 shadow-lg shadow-brand-500/20"
          >
            {saving ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" /> Guardando...
              </>
            ) : (
              <>
                <Check className="w-4 h-4" /> Guardar Configuración
              </>
            )}
          </button>
        </div>
      </div>

      {/* Selector de sede si es Owner */}
      {isOwner && locations.length > 1 && (
        <div className="bg-surface-300 rounded-xl p-4 border border-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex-1">
            <label className="text-xs font-medium text-gray-300 block mb-1">
              Punto de venta a configurar:
            </label>
            <select
              value={selectedLocId}
              onChange={e => { setSelectedLocId(e.target.value); setApplyToAll(false) }}
              disabled={applyToAll}
              className="input text-sm w-full max-w-sm disabled:opacity-50"
            >
              {locations.map(loc => (
                <option key={loc.id} value={loc.id}>
                  📍 {loc.name} {loc.address ? `(${loc.address})` : ''}
                </option>
              ))}
            </select>
          </div>

          <label className="flex items-center gap-2 text-xs font-medium text-white cursor-pointer bg-surface-400 px-3 py-2 rounded-lg border border-white/5 hover:border-brand-500/30 transition-colors">
            <input
              type="checkbox"
              checked={applyToAll}
              onChange={e => setApplyToAll(e.target.checked)}
              className="checkbox checkbox-primary rounded w-4 h-4"
            />
            <span>Aplicar cambios a <strong>todas las sedes</strong></span>
          </label>
        </div>
      )}

      {/* Grid: Formulario de configuración (Izquierda) + Simulador Ticket Térmico en Vivo (Derecha) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Columna Izquierda: Ajustes y Logo */}
        <div className="lg:col-span-7 space-y-6">
          
          {/* Card: Logo para factura térmica */}
          <div className="card bg-surface-300 border border-white/5 p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-white/5 pb-3">
              <div>
                <h3 className="font-semibold text-sm text-white flex items-center gap-2">
                  <ImageIcon className="w-4 h-4 text-brand-400" />
                  Logo del Recibo Térmico
                </h3>
                <p className="text-xs text-gray-400">
                  Aparecerá centrado en la parte superior del recibo impreso.
                </p>
              </div>
              {logoUrl && (
                <span className="text-[11px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full inline-flex items-center gap-1 font-medium">
                  <CheckCircle2 className="w-3 h-3" /> Configurado
                </span>
              )}
            </div>

            {/* Zona de previsualización o carga */}
            {logoUrl ? (
              <div className="bg-surface-400 rounded-xl p-4 border border-white/10 flex flex-col sm:flex-row items-center gap-4">
                <div className="w-32 h-20 bg-white rounded-lg p-2 flex items-center justify-center shadow-inner overflow-hidden shrink-0 border border-gray-300">
                  <img
                    src={logoUrl}
                    alt="Logo actual"
                    className="max-h-full max-w-full object-contain filter grayscale contrast-125"
                  />
                </div>
                <div className="flex-1 space-y-2 text-center sm:text-left">
                  <p className="text-xs font-medium text-white">Logo cargado para recibo</p>
                  <p className="text-[11px] text-gray-400">
                    Se procesa en escala de grises para máxima nitidez en cabezales térmicos.
                  </p>
                  <div className="flex flex-wrap gap-2 pt-1 justify-center sm:justify-start">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploadingLogo}
                      className="btn btn-ghost btn-sm text-xs inline-flex items-center gap-1.5 border border-white/10"
                    >
                      <Upload className="w-3.5 h-3.5" /> Cambiar imagen
                    </button>
                    <button
                      type="button"
                      onClick={handleRemoveLogo}
                      className="btn btn-ghost btn-sm text-xs text-red-400 hover:text-red-300 inline-flex items-center gap-1.5 border border-red-500/20"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Quitar logo
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-white/15 hover:border-brand-500/50 bg-surface-400/50 hover:bg-surface-400 rounded-xl p-6 text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-2 group"
              >
                <div className="w-12 h-12 rounded-full bg-brand-500/10 text-brand-400 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <Upload className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-sm font-medium text-white">
                    Haz clic aquí o arrastra una imagen para el logo
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    Formatos recomendados: PNG o JPG con fondo blanco/transparente (Máx. 2MB)
                  </p>
                </div>
              </div>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={handleFileSelect}
              className="hidden"
            />

            <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 text-xs text-amber-300 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                <strong>Consejo térmico:</strong> Las impresoras térmicas solo imprimen en blanco y negro puro. Diseños con alto contraste, siluetas o líneas definidas brindan el mejor resultado.
              </span>
            </div>
          </div>

          {/* Card: Formato de papel e impresora */}
          <div className="card bg-surface-300 border border-white/5 p-5 space-y-4">
            <h3 className="font-semibold text-sm text-white flex items-center gap-2 border-b border-white/5 pb-3">
              <Sliders className="w-4 h-4 text-brand-400" />
              Parámetros de la Impresora
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Tamaño del papel */}
              <div>
                <label className="text-xs font-medium text-gray-300 block mb-1">
                  Ancho del papel térmico
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setPaperWidth('80mm')}
                    className={`p-3 rounded-lg border text-left transition-all ${
                      paperWidth === '80mm'
                        ? 'border-brand-500 bg-brand-500/15 text-white'
                        : 'border-white/10 bg-surface-400 text-gray-400 hover:text-white'
                    }`}
                  >
                    <div className="font-bold text-sm">80 mm</div>
                    <div className="text-[11px] opacity-75">Estándar POS (48 col)</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPaperWidth('58mm')}
                    className={`p-3 rounded-lg border text-left transition-all ${
                      paperWidth === '58mm'
                        ? 'border-brand-500 bg-brand-500/15 text-white'
                        : 'border-white/10 bg-surface-400 text-gray-400 hover:text-white'
                    }`}
                  >
                    <div className="font-bold text-sm">58 mm</div>
                    <div className="text-[11px] opacity-75">Mini térmico (32 col)</div>
                  </button>
                </div>
              </div>

              {/* Nombre de la impresora */}
              <div>
                <label className="text-xs font-medium text-gray-300 block mb-1">
                  Nombre de la impresora (opcional)
                </label>
                <input
                  type="text"
                  value={printerName}
                  onChange={e => setPrinterName(e.target.value)}
                  placeholder="ej. POS-80, EPSON TM-T20"
                  className="input text-sm w-full"
                />
                <p className="text-[11px] text-gray-500 mt-1">
                  Identificador para integración con software de impresión directa.
                </p>
              </div>
            </div>

            {/* QZ Tray Toggle */}
            <div className="pt-2 border-t border-white/5">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={useQzTray}
                  onChange={e => setUseQzTray(e.target.checked)}
                  className="checkbox checkbox-primary rounded mt-0.5"
                />
                <div>
                  <span className="text-xs font-medium text-white block">
                    Habilitar impresión directa con QZ Tray
                  </span>
                  <span className="text-[11px] text-gray-400 block">
                    Permite imprimir directo a la impresora sin mostrar el diálogo del navegador. Si QZ Tray no está corriendo, se usa automáticamente la ventana del navegador.
                  </span>
                </div>
              </label>
            </div>
          </div>

          {/* Card: Textos del Encabezado y Pie */}
          <div className="card bg-surface-300 border border-white/5 p-5 space-y-4">
            <h3 className="font-semibold text-sm text-white flex items-center gap-2 border-b border-white/5 pb-3">
              <FileText className="w-4 h-4 text-brand-400" />
              Textos de Cabecera y Pie de Factura
            </h3>

            {/* Encabezado */}
            <div>
              <label className="text-xs font-medium text-gray-300 block mb-1">
                Líneas de Cabecera (Una por línea: Razón Social, NIT, Dirección, etc.)
              </label>
              <textarea
                rows={3}
                value={headerLines.join('\n')}
                onChange={e => setHeaderLines(e.target.value.split('\n'))}
                className="input text-sm w-full font-mono py-2 leading-relaxed"
                placeholder="PIROTÉCNICA LA CHISPA&#10;NIT 900.123.456-7&#10;Carrera 50 # 40-20"
              />
            </div>

            {/* Pie de página */}
            <div>
              <label className="text-xs font-medium text-gray-300 block mb-1">
                Líneas de Pie de Página (Agradecimiento, advertencias legales)
              </label>
              <textarea
                rows={3}
                value={footerLines.join('\n')}
                onChange={e => setFooterLines(e.target.value.split('\n'))}
                className="input text-sm w-full font-mono py-2 leading-relaxed"
                placeholder="¡Gracias por su compra!&#10;Manipule con responsabilidad"
              />
            </div>
          </div>
        </div>

        {/* Columna Derecha: Simulador de Recibo Térmico en Vivo */}
        <div className="lg:col-span-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-sm text-white flex items-center gap-2">
              <Eye className="w-4 h-4 text-brand-400" />
              Vista Previa en Vivo ({paperWidth})
            </h3>
            <span className="text-[11px] text-gray-400">Simulador de papel térmico</span>
          </div>

          {/* Contenedor del Ticket Térmico con diseño realista */}
          <div className="flex justify-center p-4 bg-surface-500/80 rounded-2xl border border-white/10 overflow-hidden">
            <div
              className="bg-[#fcfbf9] text-gray-900 shadow-2xl p-5 transition-all duration-300 rounded-sm relative selection:bg-gray-300 selection:text-black"
              style={{
                width: paperWidth === '80mm' ? '320px' : '250px',
                fontFamily: '"Courier New", Courier, monospace',
                fontSize: paperWidth === '80mm' ? '12px' : '11px',
                lineHeight: '1.35',
              }}
            >
              {/* Borde dentado superior simulado */}
              <div className="absolute top-0 left-0 right-0 h-1.5 bg-[radial-gradient(#1e1e24_2px,transparent_2px)] bg-[size:6px_6px] -mt-1 opacity-20"></div>

              {/* Logo en el ticket */}
              {logoUrl ? (
                <div className="flex justify-center mb-3">
                  <img
                    src={logoUrl}
                    alt="Logo Ticket"
                    className="max-h-16 max-w-[80%] object-contain filter grayscale contrast-150"
                  />
                </div>
              ) : (
                <div className="text-center text-[10px] text-gray-400 border border-dashed border-gray-300 py-1.5 mb-2 rounded">
                  [ Sin logo configurado ]
                </div>
              )}

              {/* Encabezados */}
              <div className="text-center space-y-0.5 mb-2">
                {headerLines.filter(Boolean).map((h, i) => (
                  <div key={i} className={i === 0 ? 'font-bold text-sm text-black tracking-tight' : 'text-gray-700'}>
                    {h}
                  </div>
                ))}
              </div>

              <div className="border-t border-dashed border-gray-400 my-2"></div>

              {/* Info Factura */}
              <div className="text-[11px] space-y-0.5 text-gray-700">
                <div className="flex justify-between">
                  <span>Factura:</span>
                  <span className="font-bold text-black">#TEST-001</span>
                </div>
                <div className="flex justify-between">
                  <span>Fecha:</span>
                  <span>{new Date().toLocaleDateString('es-CO')}</span>
                </div>
                <div className="flex justify-between">
                  <span>Vendedor:</span>
                  <span>Caja Principal</span>
                </div>
              </div>

              <div className="border-t border-dashed border-gray-400 my-2"></div>

              {/* Items */}
              <div className="space-y-2 mb-2">
                {sampleInvoice.items.map((item, i) => (
                  <div key={i} className="text-gray-800">
                    <div className="font-medium text-black truncate">{item.productName}</div>
                    <div className="flex justify-between text-[11px] text-gray-600">
                      <span>&nbsp;&nbsp;{item.label}</span>
                      <span>x{item.qty}&nbsp;&nbsp;{formatCOP(item.subtotal)}</span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="border-t border-solid border-black my-2"></div>

              {/* Total */}
              <div className="flex justify-between items-center font-bold text-sm text-black">
                <span>TOTAL</span>
                <span>{formatCOP(sampleInvoice.total)}</span>
              </div>

              <div className="border-t border-dashed border-gray-400 my-2"></div>

              <div className="text-[11px] text-gray-700">
                <span>MÉTODO: EFECTIVO</span>
              </div>

              <div className="border-t border-dashed border-gray-400 my-2"></div>

              {/* Pie de página */}
              <div className="text-center space-y-0.5 text-[11px] text-gray-700 mt-2">
                {footerLines.filter(Boolean).map((f, i) => (
                  <div key={i}>{f}</div>
                ))}
              </div>

              {/* Borde dentado inferior simulado */}
              <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-[radial-gradient(#1e1e24_2px,transparent_2px)] bg-[size:6px_6px] -mb-1 opacity-20"></div>
            </div>
          </div>

          {/* Botones para probar impresión real */}
          <div className="bg-surface-300 rounded-xl p-4 border border-white/5 space-y-2">
            <p className="text-xs font-medium text-white">Probar impresión en este dispositivo:</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={handleTestPrintBrowser}
                className="btn btn-ghost btn-sm text-xs border border-white/10 hover:border-brand-500/30 flex items-center justify-center gap-1.5"
              >
                <Printer className="w-3.5 h-3.5 text-brand-400" />
                Imprimir Prueba (POS)
              </button>
              <button
                type="button"
                onClick={handleTestPrintPDF}
                className="btn btn-ghost btn-sm text-xs border border-white/10 hover:border-brand-500/30 flex items-center justify-center gap-1.5"
              >
                <FileText className="w-3.5 h-3.5 text-cyan-400" />
                Descargar PDF
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
