import { supabaseAdmin } from '../../_lib/supabaseAdmin.js'
import { handleCors }    from '../../_lib/cors.js'
import { requireAuth }   from '../../_lib/auth.js'

export default async function handler(req, res) {
  if (handleCors(req, res)) return

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' })
  }

  // Solo cajero o admin pueden editar facturas
  const auth = await requireAuth(req, res)
  if (!auth) return

  if (!['cashier', 'admin'].includes(auth.seller.role)) {
    return res.status(403).json({ error: 'Solo cajero o admin pueden editar facturas' })
  }

  const { code } = req.query
  const { location_id, items, observations } = req.body || {}

  if (!location_id) {
    return res.status(400).json({ error: 'location_id es requerido' })
  }

  // Verificar que la factura existe y está pendiente
  const { data: existing, error: findErr } = await supabaseAdmin
    .from('invoices')
    .select('id, status')
    .eq('code', code)
    .eq('location_id', location_id)
    .eq('status', 'pending')
    .single()

  if (findErr || !existing) {
    return res.status(404).json({ error: 'Factura pendiente no encontrada' })
  }

  // Construir el objeto de actualización
  const updates = {
    edited_by: auth.seller.id,
    edited_at: new Date().toISOString(),
  }

  // Si se envían items, validar y recalcular total
  if (items !== undefined) {
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'items debe ser un arreglo con al menos 1 elemento' })
    }

    for (const item of items) {
      if (!item.price || !item.qty || item.qty <= 0) {
        return res.status(400).json({ error: 'Cada item debe tener price y qty > 0' })
      }
    }

    // Recalcular subtotals y total
    const processedItems = items.map(item => ({
      ...item,
      subtotal: item.price * item.qty,
    }))

    updates.items = processedItems
    updates.total = processedItems.reduce((sum, i) => sum + i.subtotal, 0)
  }

  // Si se envían observaciones, agregar
  if (observations !== undefined) {
    updates.observations = observations || null
  }

  const { data, error } = await supabaseAdmin
    .from('invoices')
    .update(updates)
    .eq('id', existing.id)
    .eq('status', 'pending')  // guard extra
    .select()
    .single()

  if (error) {
    console.error('[invoices/edit] DB error:', error)
    return res.status(500).json({ error: error.message })
  }

  return res.status(200).json(data)
}
