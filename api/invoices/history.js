import { supabaseAdmin } from '../_lib/supabaseAdmin.js'
import { handleCors }    from '../_lib/cors.js'

export default async function handler(req, res) {
  if (handleCors(req, res)) return

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Método no permitido' })
  }

  const { location_id, date, status, seller_id, limit = '50', offset = '0' } = req.query

  const day = date ? new Date(date) : new Date()
  day.setHours(0, 0, 0, 0)
  const dayEnd = new Date(day)
  dayEnd.setDate(dayEnd.getDate() + 1)

  let query = supabaseAdmin
    .from('invoices')
    .select('id, code, location_id, location_name, seller_id, seller_name, total, status, pay_method, items, observations, edited_at, edited_by, created_at, paid_at', { count: 'exact' })
    .gte('created_at', day.toISOString())
    .lt('created_at',  dayEnd.toISOString())
    .order('created_at', { ascending: false })
    .range(parseInt(offset, 10), parseInt(offset, 10) + parseInt(limit, 10) - 1)

  if (location_id) query = query.eq('location_id', location_id)
  if (status)      query = query.eq('status', status)
  if (seller_id)   query = query.eq('seller_id', seller_id)

  const { data, error, count } = await query
  if (error) return res.status(500).json({ error: error.message })

  return res.status(200).json({ invoices: data || [], total: count || 0 })
}
