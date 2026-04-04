import { supabaseAdmin } from '../_lib/supabaseAdmin.js'
import { handleCors }    from '../_lib/cors.js'
import { requireAuth }   from '../_lib/auth.js'

export default async function handler(req, res) {
  if (handleCors(req, res)) return

  // POST — crear nueva factura
  if (req.method === 'POST') {
    const auth = await requireAuth(req, res)
    if (!auth) return

    const { location_id, seller_id, seller_name, location_name, items } = req.body || {}

    if (!location_id || !seller_id || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'location_id, seller_id e items son requeridos' })
    }

    // Validar que los items tengan los campos necesarios
    for (const item of items) {
      if (!item.presentationId || !item.price || !item.qty) {
        return res.status(400).json({ error: 'Cada item debe tener presentationId, price y qty' })
      }
    }

    const total = items.reduce((sum, i) => sum + (i.price * i.qty), 0)

    // Obtener siguiente código disponible via función Postgres (atómico, sin race condition)
    const { data: codeResult, error: codeErr } = await supabaseAdmin
      .rpc('get_next_invoice_code', { p_location_id: location_id })

    if (codeErr || !codeResult) {
      console.error('[invoices/index] Error al obtener código:', codeErr)
      return res.status(500).json({ error: 'No se pudo generar el código de factura' })
    }

    const code = codeResult

    // Crear factura con snapshot completo de los items
    const { data: invoice, error: invErr } = await supabaseAdmin
      .from('invoices')
      .insert({
        code,
        location_id,
        location_name: location_name || null,
        seller_id,
        seller_name:   seller_name   || null,
        total,
        status:        'pending',
        items,       // JSONB snapshot — precios y nombres capturados al momento
      })
      .select()
      .single()

    if (invErr) {
      console.error('[invoices/index] Error al insertar:', invErr)
      return res.status(500).json({ error: 'No se pudo crear la factura' })
    }

    return res.status(201).json(invoice)
  }

  return res.status(405).json({ error: 'Método no permitido' })
}
