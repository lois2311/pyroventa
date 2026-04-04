// =====================================================
// PyroVenta — Servicio de impresión
// 3 capas: QZ Tray → window.print() → jsPDF
// =====================================================

import { formatCOP, formatDate, payMethodLabel } from './format.js'

// ---- Constantes de formato --------------------------
const LINE_58 = 32 // chars por línea a 58mm
const LINE_80 = 48 // chars por línea a 80mm

// =====================================================
// CAPA 1 — QZ Tray (impresora USB/WiFi real)
// =====================================================
async function printViaQZ(invoice, config) {
  if (typeof window.qz === 'undefined') {
    throw new Error('QZ Tray no disponible')
  }

  try {
    if (!window.qz.websocket.isActive()) {
      await window.qz.websocket.connect({ retries: 2, delay: 1000 })
    }

    const printerName = config?.printer_name || null
    const qzConfig = window.qz.configs.create(printerName)
    const commands = buildEscPosCommands(invoice, config)

    await window.qz.print(qzConfig, commands)
  } catch (err) {
    throw new Error(`QZ Tray error: ${err.message}`)
  }
}

// =====================================================
// CAPA 2 — window.print() con HTML optimizado
// =====================================================
export function printBrowserFallback(invoice, config) {
  const html = buildHTMLReceipt(invoice, config)
  const win = window.open('', '_blank', 'width=450,height=700,menubar=no,toolbar=no,scrollbars=yes')
  if (!win) {
    throw new Error('El navegador bloqueó la ventana emergente. Permita popups para este sitio.')
  }
  win.document.write(html)
  win.document.close()
  win.focus()
  setTimeout(() => {
    win.print()
    setTimeout(() => win.close(), 1000)
  }, 500)
}

// =====================================================
// CAPA 3 — jsPDF
// =====================================================
export async function generatePDF(invoice, config) {
  const { jsPDF } = await import('jspdf')
  const isWide    = config?.paper_width === '80mm'
  const pageWidth = isWide ? 80 : 58
  const doc = new jsPDF({ unit: 'mm', format: [pageWidth, 220], orientation: 'portrait' })

  const margin = 3
  const width  = pageWidth - margin * 2
  let y = margin + 4

  const addLine = (text, opts = {}) => {
    const { align = 'left', bold = false, size = 8 } = opts
    doc.setFontSize(size)
    doc.setFont('courier', bold ? 'bold' : 'normal')
    if (align === 'center') {
      doc.text(text, pageWidth / 2, y, { align: 'center' })
    } else {
      doc.text(text, margin, y)
    }
    y += size * 0.4 + 1
  }

  const addDivider = (dashed = true) => {
    const char  = dashed ? '-' : '='
    const chars = isWide ? LINE_80 : LINE_58
    addLine(char.repeat(chars))
  }

  // Cabecera
  const headers = config?.header_lines || ['PIROTÉCNICA LA CHISPA']
  headers.forEach((line, i) => addLine(line, { align: 'center', bold: i === 0, size: i === 0 ? 10 : 8 }))
  addDivider()

  addLine(`Factura:  #${invoice.code}`)
  addLine(`Fecha:    ${formatDate(invoice.created_at)}`)
  addLine(`Vendedor: ${invoice.seller_name || '—'}`)
  addDivider()

  // Items
  const charsPerLine = isWide ? LINE_80 : LINE_58
  const items = Array.isArray(invoice.items) ? invoice.items : []
  items.forEach(item => {
    addLine(truncate(item.product_name || item.productName || 'Producto', charsPerLine))
    const right = `x${item.qty}  ${formatCOP(item.subtotal)}`
    const label = `  ${item.label}`
    const pad   = charsPerLine - label.length - right.length
    addLine(label + ' '.repeat(Math.max(0, pad)) + right)
  })

  addDivider(false)
  addLine(`${'TOTAL'.padEnd(charsPerLine - formatCOP(invoice.total).length)}${formatCOP(invoice.total)}`, { bold: true, size: 10 })
  addDivider()
  addLine(`MÉTODO DE PAGO: ${payMethodLabel(invoice.pay_method)}`)

  if (invoice.observations) {
    addDivider()
    addLine('OBSERVACIONES:', { bold: true })
    addLine(truncate(invoice.observations, charsPerLine * 3))
  }

  addDivider()

  const footers = config?.footer_lines || ['¡Gracias por su compra!', 'Manipule con responsabilidad']
  footers.forEach(line => addLine(line, { align: 'center' }))

  doc.save(`factura-${invoice.code}.pdf`)
}

// =====================================================
// FUNCIÓN PRINCIPAL — cascade con fallback
// =====================================================
export async function printReceipt(invoice, config) {
  // Intentar QZ Tray primero
  if (config?.use_qz_tray !== false) {
    try {
      await printViaQZ(invoice, config)
      return 'qz'
    } catch (err) {
      console.warn('[printService] QZ Tray falló:', err.message)
    }
  }

  // Fallback: browser window.print()
  try {
    printBrowserFallback(invoice, config)
    return 'browser'
  } catch (err) {
    console.warn('[printService] Browser print falló:', err.message)
  }

  // Último recurso: PDF
  await generatePDF(invoice, config)
  return 'pdf'
}

// =====================================================
// Helpers internos
// =====================================================

function truncate(str, len) {
  if (!str) return ''
  return str.length > len ? str.slice(0, len - 1) + '…' : str
}

function padRight(str, len) {
  return String(str).padEnd(len).slice(0, len)
}

function padLeft(str, len) {
  return String(str).padStart(len).slice(-len)
}

/**
 * Genera texto plano en formato ESC/POS-like para el recibo.
 * Útil como preview y para escpos-buffer.
 */
export function formatReceiptText(invoice, config) {
  const isWide    = config?.paper_width === '80mm'
  const lineWidth = isWide ? LINE_80 : LINE_58
  const sep       = '-'.repeat(lineWidth)
  const sepD      = '='.repeat(lineWidth)
  const lines     = []

  const center = (text) => {
    const spaces = Math.max(0, Math.floor((lineWidth - text.length) / 2))
    return ' '.repeat(spaces) + text
  }

  const headers = config?.header_lines || ['PIROTÉCNICA LA CHISPA']
  headers.forEach(h => lines.push(center(h)))
  lines.push(sep)

  lines.push(`Factura:  #${invoice.code}`)
  lines.push(`Fecha:    ${formatDate(invoice.created_at)}`)
  lines.push(`Vendedor: ${invoice.seller_name || '—'}`)
  lines.push(sep)

  // Encabezado tabla
  lines.push(
    padRight('PRODUCTO', lineWidth - 14) +
    padLeft('CANT', 6) +
    padLeft('VALOR', 8)
  )

  const items = Array.isArray(invoice.items) ? invoice.items : []
  items.forEach(item => {
    const nameLen = lineWidth - 14
    lines.push(truncate(item.product_name || item.productName || 'Producto', nameLen))
    const label = `  ${item.label}`
    const right = `x${item.qty}  ${formatCOP(item.subtotal)}`
    lines.push(padRight(label, lineWidth - right.length) + right)
  })

  lines.push(sepD)

  const totalStr = formatCOP(invoice.total)
  lines.push(padRight('TOTAL', lineWidth - totalStr.length) + totalStr)
  lines.push(sep)
  lines.push(`MÉTODO DE PAGO: ${payMethodLabel(invoice.pay_method)}`)

  if (invoice.observations) {
    lines.push(sep)
    lines.push('OBSERVACIONES:')
    lines.push(truncate(invoice.observations, lineWidth * 3))
  }

  lines.push(sep)

  const footers = config?.footer_lines || ['¡Gracias por su compra!', 'Manipule con responsabilidad']
  footers.forEach(f => lines.push(center(f)))

  return lines.join('\n')
}

/**
 * Genera comandos ESC/POS para QZ Tray.
 */
function buildEscPosCommands(invoice, config) {
  const text = formatReceiptText(invoice, config)
  // ESC/POS básico: inicializar impresora, imprimir texto, cortar papel
  return [
    '\x1B\x40',        // ESC @ — init
    '\x1B\x61\x01',    // ESC a 1 — center alignment
    text,
    '\n\n\n',
    '\x1D\x56\x41\x00' // GS V A — partial cut
  ]
}

/**
 * Genera HTML para window.print().
 */
function buildHTMLReceipt(invoice, config) {
  const isWide    = config?.paper_width === '80mm'
  const widthClass = isWide ? 'receipt-80mm' : 'receipt-58mm'
  const items     = Array.isArray(invoice.items) ? invoice.items : []
  const headers   = config?.header_lines || ['PIROTÉCNICA LA CHISPA']
  const footers   = config?.footer_lines || ['¡Gracias por su compra!', 'Manipule con responsabilidad']

  const itemsHTML = items.map(item => `
    <div class="receipt-item">
      <div>${escHtml(item.product_name || item.productName || 'Producto')}</div>
      <div class="receipt-row">
        <span>&nbsp;&nbsp;${escHtml(item.label)}</span>
        <span>x${item.qty}&nbsp;&nbsp;${formatCOP(item.subtotal)}</span>
      </div>
    </div>
  `).join('')

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Recibo #${invoice.code}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: #fff; }
  .${widthClass} {
    width: ${isWide ? '80mm' : '58mm'};
    font-family: 'Courier New', Courier, monospace;
    font-size: 9pt;
    line-height: 1.4;
    color: #000;
    padding: 4mm 3mm;
  }
  .center    { text-align: center; }
  .bold      { font-weight: bold; }
  .big       { font-size: 11pt; }
  .divider   { border-top: 1px dashed #000; margin: 2mm 0; }
  .divider-s { border-top: 1px solid  #000; margin: 2mm 0; }
  .receipt-row   { display: flex; justify-content: space-between; }
  .receipt-item  { margin-bottom: 1mm; }
  .total-row     { display: flex; justify-content: space-between; font-weight: bold; font-size: 11pt; }
  @media print {
    @page { margin: 0; }
    body { margin: 0; }
  }
</style>
</head>
<body>
<div class="${widthClass}">
  ${headers.map((h, i) => `<div class="center${i === 0 ? ' bold big' : ''}">${escHtml(h)}</div>`).join('')}
  <div class="divider"></div>
  <div>Factura:  #${invoice.code}</div>
  <div>Fecha:    ${formatDate(invoice.created_at)}</div>
  <div>Vendedor: ${escHtml(invoice.seller_name || '—')}</div>
  <div class="divider"></div>
  ${itemsHTML}
  <div class="divider-s"></div>
  <div class="total-row">
    <span>TOTAL</span>
    <span>${formatCOP(invoice.total)}</span>
  </div>
  <div class="divider"></div>
  <div>MÉTODO DE PAGO: ${payMethodLabel(invoice.pay_method)}</div>
  ${invoice.observations ? `
  <div class="divider"></div>
  <div class="bold">OBSERVACIONES:</div>
  <div>${escHtml(invoice.observations)}</div>
  ` : ''}
  <div class="divider"></div>
  ${footers.map(f => `<div class="center">${escHtml(f)}</div>`).join('')}
</div>
<script>
  window.onload = function() {
    setTimeout(function() { window.print(); }, 300);
  };
<\/script>
</body>
</html>`
}

function escHtml(str) {
  if (!str) return ''
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
