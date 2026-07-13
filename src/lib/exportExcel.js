// Export XLSX con import dinámico (no engorda el bundle inicial).
// sheets: [{ name: 'Resumen', rows: [{Columna: valor, ...}, ...] }, ...]
// Los valores numéricos van crudos para que Excel los trate como números.
export async function exportToExcel(sheets, filename) {
  const XLSX = await import('xlsx')
  const wb = XLSX.utils.book_new()
  for (const sheet of sheets) {
    if (!sheet.rows?.length) continue
    const ws = XLSX.utils.json_to_sheet(sheet.rows)
    XLSX.utils.book_append_sheet(wb, ws, sheet.name.slice(0, 31))
  }
  XLSX.writeFile(wb, filename)
}
