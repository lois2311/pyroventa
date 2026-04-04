import { supabaseAdmin } from '../_lib/supabaseAdmin.js'
import { handleCors }    from '../_lib/cors.js'
import { requireAuth }   from '../_lib/auth.js'

export default async function handler(req, res) {
  if (handleCors(req, res)) return

  const { code } = req.query
  if (!code) return res.status(400).json({ error: 'Código requerido' })

  // GET — buscar factura por código dentro de un punto de venta
  if (req.method === 'GET') {
    const { location_id } = req.query
    if (!location_id) return res.status(400).json({ error: 'location_id es requerido' })

    const { data, error } = await supabaseAdmin
      .from('invoices')
      .select('*')
      .eq('code', code)
      .eq('location_id', location_id)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (error && error.code !== 'PGRST116') { // PGRST116 = not found
      return res.status(500).json({ error: error.message })
    }

    if (!data) {
      return res.status(404).json({ error: `No hay factura pendiente con código ${code} en este punto de venta` })
    }

    return res.status(200).json(data)
  }

  return res.status(405).json({ error: 'Método no permitido' })
}
