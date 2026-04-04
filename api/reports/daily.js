import { supabaseAdmin } from '../_lib/supabaseAdmin.js'
import { handleCors }    from '../_lib/cors.js'

export default async function handler(req, res) {
  if (handleCors(req, res)) return

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Método no permitido' })
  }

  const { location_id, date } = req.query

  // Rango del día
  const day   = date ? new Date(date) : new Date()
  day.setHours(0, 0, 0, 0)
  const dayEnd = new Date(day)
  dayEnd.setDate(dayEnd.getDate() + 1)

  let query = supabaseAdmin
    .from('invoices')
    .select('id, total, pay_method, status, seller_id, seller_name, location_id, location_name, items, created_at')
    .gte('created_at', day.toISOString())
    .lt('created_at',  dayEnd.toISOString())

  if (location_id) {
    query = query.eq('location_id', location_id)
  }

  const { data, error } = await query

  if (error) return res.status(500).json({ error: error.message })

  const allInvoices = data || []
  const paid        = allInvoices.filter(i => i.status === 'paid')

  const totalRevenue = paid.reduce((s, i) => s + (i.total || 0), 0)
  const invoiceCount = paid.length
  const avgTicket    = invoiceCount > 0 ? totalRevenue / invoiceCount : 0

  const byPayMethod = {
    cash:     paid.filter(i => i.pay_method === 'cash')    .reduce((s, i) => s + (i.total || 0), 0),
    transfer: paid.filter(i => i.pay_method === 'transfer').reduce((s, i) => s + (i.total || 0), 0),
    card:     paid.filter(i => i.pay_method === 'card')    .reduce((s, i) => s + (i.total || 0), 0),
  }

  // Totales por punto de venta (si es consolidado)
  const byLocation = {}
  if (!location_id) {
    paid.forEach(i => {
      if (!byLocation[i.location_id]) {
        byLocation[i.location_id] = { name: i.location_name, total: 0, count: 0 }
      }
      byLocation[i.location_id].total += i.total || 0
      byLocation[i.location_id].count += 1
    })
  }

  return res.status(200).json({
    date:             day.toISOString().split('T')[0],
    location_id:      location_id || null,
    total_revenue:    totalRevenue,
    invoice_count:    invoiceCount,
    avg_ticket:       avgTicket,
    pending_count:    allInvoices.filter(i => i.status === 'pending').length,
    cancelled_count:  allInvoices.filter(i => i.status === 'cancelled').length,
    by_pay_method:    byPayMethod,
    by_location:      Object.entries(byLocation).map(([id, v]) => ({ id, ...v })),
  })
}
