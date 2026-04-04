import { supabaseAdmin } from '../../_lib/supabaseAdmin.js'
import { handleCors }    from '../../_lib/cors.js'
import { requireAuth }   from '../../_lib/auth.js'

export default async function handler(req, res) {
  if (handleCors(req, res)) return

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' })
  }

  const auth = await requireAuth(req, res)
  if (!auth) return

  const { code } = req.query
  const { location_id } = req.body || {}

  if (!location_id) {
    return res.status(400).json({ error: 'location_id es requerido' })
  }

  const { data, error } = await supabaseAdmin
    .from('invoices')
    .update({
      status:       'cancelled',
      cancelled_at: new Date().toISOString(),
    })
    .eq('code', code)
    .eq('location_id', location_id)
    .eq('status', 'pending')   // Guard: solo cancelar pendientes
    .select()
    .single()

  if (error) {
    console.error('[invoices/cancel] DB error:', error)
    return res.status(500).json({ error: error.message })
  }

  if (!data) {
    return res.status(409).json({
      error: 'La factura no existe, ya fue cobrada o ya estaba cancelada'
    })
  }

  return res.status(200).json(data)
}
