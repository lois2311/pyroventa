import { supabaseAdmin } from '../_lib/supabaseAdmin.js'
import { handleCors }    from '../_lib/cors.js'

export default async function handler(req, res) {
  if (handleCors(req, res)) return

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Método no permitido' })
  }

  const { location_id } = req.query
  if (!location_id) {
    return res.status(400).json({ error: 'location_id es requerido' })
  }

  const { data, error } = await supabaseAdmin
    .from('invoices')
    .select('id, code, total, items, seller_id, seller_name, location_name, created_at, status')
    .eq('location_id', location_id)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[invoices/pending] DB error:', error)
    return res.status(500).json({ error: error.message })
  }

  return res.status(200).json(data || [])
}
