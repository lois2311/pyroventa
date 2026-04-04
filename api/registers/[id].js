import { supabaseAdmin } from '../_lib/supabaseAdmin.js'
import { handleCors }    from '../_lib/cors.js'
import { requireAdmin }  from '../_lib/auth.js'

export default async function handler(req, res) {
  if (handleCors(req, res)) return

  const auth = await requireAdmin(req, res)
  if (!auth) return

  const { id } = req.query

  // PUT — editar caja
  if (req.method === 'PUT') {
    const updates = {}
    const { name, active } = req.body || {}
    if (name !== undefined)   updates.name   = name.trim()
    if (active !== undefined) updates.active = active

    const { data, error } = await supabaseAdmin
      .from('registers')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json(data)
  }

  // DELETE — desactivar caja
  if (req.method === 'DELETE') {
    const { error } = await supabaseAdmin
      .from('registers')
      .update({ active: false })
      .eq('id', id)

    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ ok: true })
  }

  return res.status(405).json({ error: 'Método no permitido' })
}
