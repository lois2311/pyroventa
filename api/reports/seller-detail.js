import { supabaseAdmin } from '../_lib/supabaseAdmin.js'
import { handleCors }    from '../_lib/cors.js'

export default async function handler(req, res) {
  if (handleCors(req, res)) return

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Método no permitido' })
  }

  const { seller_id, date, location_id } = req.query

  if (!seller_id) {
    return res.status(400).json({ error: 'seller_id es requerido' })
  }

  const day = date ? new Date(date) : new Date()
  day.setHours(0, 0, 0, 0)
  const dayEnd = new Date(day)
  dayEnd.setDate(dayEnd.getDate() + 1)

  // Obtener info del vendedor
  const { data: seller } = await supabaseAdmin
    .from('sellers')
    .select('id, name, role')
    .eq('id', seller_id)
    .single()

  // Obtener facturas del vendedor en ese día
  let query = supabaseAdmin
    .from('invoices')
    .select('id, code, location_id, location_name, total, status, pay_method, items, created_at, paid_at')
    .eq('seller_id', seller_id)
    .gte('created_at', day.toISOString())
    .lt('created_at',  dayEnd.toISOString())
    .order('created_at', { ascending: false })

  if (location_id) query = query.eq('location_id', location_id)

  const { data: invoices, error } = await query
  if (error) return res.status(500).json({ error: error.message })

  const allInvoices = invoices || []
  const paid = allInvoices.filter(i => i.status === 'paid')

  // Métricas del vendedor
  const totalRevenue = paid.reduce((s, i) => s + (i.total || 0), 0)
  const avgTicket    = paid.length > 0 ? totalRevenue / paid.length : 0

  const byPayMethod = {
    cash:     paid.filter(i => i.pay_method === 'cash')    .reduce((s, i) => s + (i.total || 0), 0),
    transfer: paid.filter(i => i.pay_method === 'transfer').reduce((s, i) => s + (i.total || 0), 0),
    card:     paid.filter(i => i.pay_method === 'card')    .reduce((s, i) => s + (i.total || 0), 0),
  }

  // Timeline: agrupar por hora
  const byHour = {}
  paid.forEach(inv => {
    const hour = new Date(inv.created_at).getHours()
    const key = `${String(hour).padStart(2, '0')}:00`
    if (!byHour[key]) byHour[key] = { hour: key, count: 0, revenue: 0 }
    byHour[key].count   += 1
    byHour[key].revenue += inv.total || 0
  })

  // Top productos vendidos por este vendedor
  const productMap = {}
  paid.forEach(inv => {
    const items = Array.isArray(inv.items) ? inv.items : []
    items.forEach(item => {
      const key = item.product_name || item.label || 'Desconocido'
      if (!productMap[key]) {
        productMap[key] = { name: key, qty: 0, revenue: 0 }
      }
      productMap[key].qty     += item.qty || 0
      productMap[key].revenue += item.subtotal || 0
    })
  })

  const topProducts = Object.values(productMap)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10)

  return res.status(200).json({
    seller: seller || { id: seller_id, name: 'Desconocido' },
    date: day.toISOString().split('T')[0],
    summary: {
      total_revenue: totalRevenue,
      invoice_count: paid.length,
      avg_ticket:    avgTicket,
      pending_count: allInvoices.filter(i => i.status === 'pending').length,
      cancelled_count: allInvoices.filter(i => i.status === 'cancelled').length,
      by_pay_method: byPayMethod,
    },
    by_hour: Object.values(byHour).sort((a, b) => a.hour.localeCompare(b.hour)),
    top_products: topProducts,
    invoices: allInvoices,
  })
}
