import { supabaseAdmin } from '../_lib/supabaseAdmin.js'
import { handleCors }    from '../_lib/cors.js'
import { requireAdmin }  from '../_lib/auth.js'

export default async function handler(req, res) {
  if (handleCors(req, res)) return

  const { id } = req.query
  if (!id) return res.status(400).json({ error: 'ID requerido' })

  // PUT — actualizar producto
  if (req.method === 'PUT') {
    const auth = await requireAdmin(req, res)
    if (!auth) return

    const { name, category_id, description, active, presentations } = req.body || {}
    const updates = {}
    if (name        !== undefined) updates.name        = name
    if (category_id !== undefined) updates.category_id = category_id
    if (description !== undefined) updates.description = description
    if (active      !== undefined) updates.active      = active

    if (Object.keys(updates).length > 0) {
      const { error } = await supabaseAdmin
        .from('products')
        .update(updates)
        .eq('id', id)
      if (error) return res.status(500).json({ error: error.message })
    }

    // Actualizar presentaciones si se envían
    if (presentations) {
      // Eliminar y recrear presentaciones
      await supabaseAdmin.from('presentations').delete().eq('product_id', id)
      if (presentations.length > 0) {
        const rows = presentations.map(p => ({ product_id: id, label: p.label, price: p.price }))
        await supabaseAdmin.from('presentations').insert(rows)
      }
    }

    const { data: full } = await supabaseAdmin
      .from('products')
      .select('*, categories(*), presentations(*)')
      .eq('id', id)
      .single()

    return res.status(200).json(full)
  }

  // DELETE — desactivar producto
  if (req.method === 'DELETE') {
    const auth = await requireAdmin(req, res)
    if (!auth) return

    const { error } = await supabaseAdmin
      .from('products')
      .update({ active: false })
      .eq('id', id)

    if (error) return res.status(500).json({ error: error.message })
    return res.status(204).end()
  }

  return res.status(405).json({ error: 'Método no permitido' })
}
