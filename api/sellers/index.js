import { supabaseAdmin } from '../_lib/supabaseAdmin.js'
import { handleCors }    from '../_lib/cors.js'
import { requireAdmin }  from '../_lib/auth.js'

export default async function handler(req, res) {
  if (handleCors(req, res)) return

  // GET — listar vendedores (admin)
  if (req.method === 'GET') {
    const auth = await requireAdmin(req, res)
    if (!auth) return

    const { location_id } = req.query

    let query = supabaseAdmin
      .from('sellers')
      .select('id, name, pin, role, active, created_at, seller_locations(location_id)')
      .order('name')

    if (location_id) {
      query = supabaseAdmin
        .from('sellers')
        .select('id, name, pin, role, active, created_at, seller_locations!inner(location_id)')
        .eq('seller_locations.location_id', location_id)
        .order('name')
    }

    const { data, error } = await query
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json(data || [])
  }

  // POST — crear vendedor (admin)
  if (req.method === 'POST') {
    const auth = await requireAdmin(req, res)
    if (!auth) return

    const { name, pin, role = 'seller', location_ids = [] } = req.body || {}
    if (!name || !pin) return res.status(400).json({ error: 'name y pin son requeridos' })
    if (pin.length !== 4 || !/^\d{4}$/.test(pin)) {
      return res.status(400).json({ error: 'El PIN debe ser de 4 dígitos numéricos' })
    }

    const { data: seller, error: selErr } = await supabaseAdmin
      .from('sellers')
      .insert({ name, pin, role })
      .select()
      .single()

    if (selErr) return res.status(500).json({ error: selErr.message })

    // Asignar a puntos de venta
    if (location_ids.length > 0) {
      const rows = location_ids.map(lid => ({ seller_id: seller.id, location_id: lid }))
      await supabaseAdmin.from('seller_locations').insert(rows)
    }

    return res.status(201).json(seller)
  }

  return res.status(405).json({ error: 'Método no permitido' })
}
