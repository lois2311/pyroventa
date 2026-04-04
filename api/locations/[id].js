import { supabaseAdmin } from '../_lib/supabaseAdmin.js'
import { handleCors }    from '../_lib/cors.js'
import { requireAdmin }  from '../_lib/auth.js'

export default async function handler(req, res) {
  if (handleCors(req, res)) return

  const { id } = req.query
  if (!id) return res.status(400).json({ error: 'ID requerido' })

  // PUT — actualizar location
  if (req.method === 'PUT') {
    const auth = await requireAdmin(req, res)
    if (!auth) return

    const { name, address, printer_config, active } = req.body || {}
    const updates = {}
    if (name           !== undefined) updates.name           = name
    if (address        !== undefined) updates.address        = address
    if (printer_config !== undefined) updates.printer_config = printer_config
    if (active         !== undefined) updates.active         = active

    const { data, error } = await supabaseAdmin
      .from('locations')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) return res.status(500).json({ error: error.message })
    if (!data) return res.status(404).json({ error: 'Punto de venta no encontrado' })
    return res.status(200).json(data)
  }

  // DELETE — desactivar location
  if (req.method === 'DELETE') {
    const auth = await requireAdmin(req, res)
    if (!auth) return

    const { error } = await supabaseAdmin
      .from('locations')
      .update({ active: false })
      .eq('id', id)

    if (error) return res.status(500).json({ error: error.message })
    return res.status(204).end()
  }

  return res.status(405).json({ error: 'Método no permitido' })
}
