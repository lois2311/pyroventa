import { supabaseAdmin } from '../_lib/supabaseAdmin.js'
import { handleCors }    from '../_lib/cors.js'

export default async function handler(req, res) {
  if (handleCors(req, res)) return

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Método no permitido' })
  }

  const { location_id, date, limit = '10' } = req.query

  const day = date ? new Date(date) : new Date()
  day.setHours(0, 0, 0, 0)
  const dayEnd = new Date(day)
  dayEnd.setDate(dayEnd.getDate() + 1)

  let query = supabaseAdmin
    .from('invoices')
    .select('items')
    .gte('created_at', day.toISOString())
    .lt('created_at',  dayEnd.toISOString())
    .eq('status', 'paid')

  if (location_id) query = query.eq('location_id', location_id)

  const { data, error } = await query
  if (error) return res.status(500).json({ error: error.message })

  // Agregar ventas por producto desde el JSONB de items
  const productMap = {}

  ;(data || []).forEach(inv => {
    const items = Array.isArray(inv.items) ? inv.items : []
    items.forEach(item => {
      const key = item.productId || item.product_name || item.label
      if (!productMap[key]) {
        productMap[key] = {
          product_id:   item.productId || null,
          product_name: item.product_name || item.label || 'Desconocido',
          total_qty:    0,
          total_revenue: 0,
          presentations: {},
        }
      }
      productMap[key].total_qty     += item.qty || 0
      productMap[key].total_revenue += item.subtotal || 0

      // Desglose por presentación
      const presKey = item.label || 'Unidad'
      if (!productMap[key].presentations[presKey]) {
        productMap[key].presentations[presKey] = { qty: 0, revenue: 0 }
      }
      productMap[key].presentations[presKey].qty     += item.qty || 0
      productMap[key].presentations[presKey].revenue  += item.subtotal || 0
    })
  })

  const topProducts = Object.values(productMap)
    .map(p => ({
      ...p,
      presentations: Object.entries(p.presentations).map(([label, v]) => ({
        label, ...v
      })),
    }))
    .sort((a, b) => b.total_revenue - a.total_revenue)
    .slice(0, parseInt(limit, 10))

  return res.status(200).json(topProducts)
}
