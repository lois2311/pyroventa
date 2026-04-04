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
  const { location_id, pay_method, observations, register_id, register_name } = req.body || {}

  if (!location_id || !pay_method) {
    return res.status(400).json({ error: 'location_id y pay_method son requeridos' })
  }

  const validMethods = ['cash', 'transfer', 'card']
  if (!validMethods.includes(pay_method)) {
    return res.status(400).json({ error: `pay_method debe ser: ${validMethods.join(', ')}` })
  }

  // Actualizar SOLO si la factura está pending (guard anti doble-pago)
  const { data, error } = await supabaseAdmin
    .from('invoices')
    .update({
      status:        'paid',
      pay_method,
      paid_at:       new Date().toISOString(),
      cashier_id:    auth.seller.id,
      cashier_name:  auth.seller.name,
      ...(register_id   ? { register_id }   : {}),
      ...(register_name ? { register_name } : {}),
      ...(observations  ? { observations }  : {}),
    })
    .eq('code', code)
    .eq('location_id', location_id)
    .eq('status', 'pending')   // ← Guard crítico
    .select()
    .single()

  if (error) {
    console.error('[invoices/pay] DB error:', error)
    return res.status(500).json({ error: error.message })
  }

  if (!data) {
    return res.status(409).json({
      error: 'La factura no existe, ya fue cobrada o fue cancelada'
    })
  }

  return res.status(200).json(data)
}
