import { supabaseAdmin } from '../_lib/supabaseAdmin.js'
import { handleCors }    from '../_lib/cors.js'
import { requireAdmin }  from '../_lib/auth.js'

export default async function handler(req, res) {
  if (handleCors(req, res)) return

  const { id } = req.query
  if (!id) return res.status(400).json({ error: 'ID requerido' })

  // PUT — actualizar vendedor
  if (req.method === 'PUT') {
    const auth = await requireAdmin(req, res)
    if (!auth) return

    const { name, pin, role, active, location_ids } = req.body || {}
    const updates = {}
    if (name   !== undefined) updates.name   = name
    if (pin    !== undefined) {
      if (!/^\d{4}$/.test(pin)) return res.status(400).json({ error: 'PIN debe ser 4 dígitos' })
      updates.pin = pin
    }
    if (role   !== undefined) updates.role   = role
    if (active !== undefined) updates.active = active

    if (Object.keys(updates).length > 0) {
      const { error } = await supabaseAdmin.from('sellers').update(updates).eq('id', id)
      if (error) return res.status(500).json({ error: error.message })
    }

    // Reasignar locations si se envían
    if (Array.isArray(location_ids)) {
      await supabaseAdmin.from('seller_locations').delete().eq('seller_id', id)
      if (location_ids.length > 0) {
        const rows = location_ids.map(lid => ({ seller_id: id, location_id: lid }))
        await supabaseAdmin.from('seller_locations').insert(rows)
      }
    }

    const { data } = await supabaseAdmin
      .from('sellers')
      .select('*, seller_locations(location_id)')
      .eq('id', id)
      .single()

    return res.status(200).json(data)
  }

  // DELETE — desactivar vendedor
  if (req.method === 'DELETE') {
    const auth = await requireAdmin(req, res)
    if (!auth) return

    const { error } = await supabaseAdmin
      .from('sellers')
      .update({ active: false })
      .eq('id', id)

    if (error) return res.status(500).json({ error: error.message })
    return res.status(204).end()
  }

  return res.status(405).json({ error: 'Método no permitido' })
}
