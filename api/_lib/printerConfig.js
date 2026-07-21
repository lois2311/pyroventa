// Config de impresora por defecto para un punto de venta nuevo.
// Usada al crear locations desde el admin del tenant y desde el panel súper.
export function defaultPrinterConfig(tenantName, address) {
  return {
    printer_name:   'POS-80',
    paper_width:    '80mm',
    chars_per_line: 48,
    header_lines:   [String(tenantName || '').toUpperCase(), address || ''],
    footer_lines:   ['¡Gracias por su compra!', 'Manipule con responsabilidad'],
    use_qz_tray:    false,
  }
}
