import { supabaseAdmin } from '../_lib/supabaseAdmin.js'
import { handleCors }    from '../_lib/cors.js'

export default async function handler(req, res) {
  if (handleCors(req, res)) return

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Método no permitido' })
  }

  const { location_id, date } = req.query

  const day = date ? new Date(date) : new Date()
  day.setHours(0, 0, 0, 0)
  const dayEnd = new Date(day)
  dayEnd.setDate(dayEnd.getDate() + 1)

  let query = supabaseAdmin
    .from('invoices')
    .select('seller_id, seller_name, total, status, pay_method')
    .gte('created_at', day.toISOString())
    .lt('created_at',  dayEnd.toISOString())
    .eq('status', 'paid')

  if (location_id) query = query.eq('location_id', location_id)

  const { data, error } = await query
  if (error) return res.status(500).json({ error: error.message })

  // Agrupar por vendedor
  const bySellerMap = {}
  ;(data || []).forEach(inv => {
    const key = inv.seller_id
    if (!bySellerMap[key]) {
      bySellerMap[key] = {
        seller_id:   inv.seller_id,
        seller_name: inv.seller_name || 'Desconocido',
        total:       0,
        count:       0,
        by_method:   { cash: 0, transfer: 0, card: 0 },
      }
    }
    bySellerMap[key].total += inv.total || 0
    bySellerMap[key].count += 1
    if (inv.pay_method) bySellerMap[key].by_method[inv.pay_method] += inv.total || 0
  })

  const bySeller = Object.values(bySellerMap)
    .map(s => ({ ...s, avg_ticket: s.count > 0 ? s.total / s.count : 0 }))
    .sort((a, b) => b.total - a.total)

  return res.status(200).json(bySeller)
}
