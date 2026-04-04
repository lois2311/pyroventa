import { supabaseAdmin } from '../_lib/supabaseAdmin.js'
import { handleCors }    from '../_lib/cors.js'
import { requireAuth, requireAdmin } from '../_lib/auth.js'

export default async function handler(req, res) {
  if (handleCors(req, res)) return

  // GET — listar cajas (filtrar por location_id)
  if (req.method === 'GET') {
    const { location_id } = req.query

    let query = supabaseAdmin
      .from('registers')
      .select('id, name, location_id, active, created_at')
      .eq('active', true)
      .order('name')

    if (location_id) query = query.eq('location_id', location_id)

    const { data, error } = await query
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json(data || [])
  }

  // POST — crear caja (solo admin)
  if (req.method === 'POST') {
    const auth = await requireAdmin(req, res)
    if (!auth) return

    const { name, location_id } = req.body || {}
    if (!name?.trim() || !location_id) {
      return res.status(400).json({ error: 'name y location_id son requeridos' })
    }

    const { data, error } = await supabaseAdmin
      .from('registers')
      .insert({ name: name.trim(), location_id, active: true })
      .select()
      .single()

    if (error) return res.status(500).json({ error: error.message })
    return res.status(201).json(data)
  }

  return res.status(405).json({ error: 'Método no permitido' })
}
