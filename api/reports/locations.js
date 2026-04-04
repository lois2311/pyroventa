import { supabaseAdmin } from '../_lib/supabaseAdmin.js'
import { handleCors }    from '../_lib/cors.js'

export default async function handler(req, res) {
  if (handleCors(req, res)) return

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Método no permitido' })
  }

  const { date } = req.query

  const day = date ? new Date(date) : new Date()
  day.setHours(0, 0, 0, 0)
  const dayEnd = new Date(day)
  dayEnd.setDate(dayEnd.getDate() + 1)

  // Obtener todas las locations activas
  const { data: locations } = await supabaseAdmin
    .from('locations')
    .select('id, name, address')
    .eq('active', true)

  // Obtener facturas del día de todos los puntos
  const { data: invoices, error } = await supabaseAdmin
    .from('invoices')
    .select('location_id, total, status, pay_method')
    .gte('created_at', day.toISOString())
    .lt('created_at',  dayEnd.toISOString())

  if (error) return res.status(500).json({ error: error.message })

  // Agrupar por location
  const locMap = {}
  ;(locations || []).forEach(loc => {
    locMap[loc.id] = {
      location_id:     loc.id,
      location_name:   loc.name,
      address:         loc.address,
      total_revenue:   0,
      invoice_count:   0,
      pending_count:   0,
      cancelled_count: 0,
      avg_ticket:      0,
      by_pay_method:   { cash: 0, transfer: 0, card: 0 },
    }
  })

  ;(invoices || []).forEach(inv => {
    const loc = locMap[inv.location_id]
    if (!loc) return
    if (inv.status === 'paid') {
      loc.total_revenue += inv.total || 0
      loc.invoice_count += 1
      if (inv.pay_method) loc.by_pay_method[inv.pay_method] += inv.total || 0
    }
    if (inv.status === 'pending')   loc.pending_count   += 1
    if (inv.status === 'cancelled') loc.cancelled_count += 1
  })

  const result = Object.values(locMap).map(loc => ({
    ...loc,
    avg_ticket: loc.invoice_count > 0 ? loc.total_revenue / loc.invoice_count : 0,
  })).sort((a, b) => b.total_revenue - a.total_revenue)

  return res.status(200).json(result)
}
