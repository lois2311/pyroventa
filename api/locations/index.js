import { supabaseAdmin } from '../_lib/supabaseAdmin.js'
import { handleCors }    from '../_lib/cors.js'
import { requireAdmin }  from '../_lib/auth.js'

export default async function handler(req, res) {
  if (handleCors(req, res)) return

  // GET — lista pública (para pantalla de login)
  if (req.method === 'GET') {
    const { data, error } = await supabaseAdmin
      .from('locations')
      .select('id, name, address, printer_config, active')
      .order('name')

    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json(data)
  }

  // POST — crear location (admin)
  if (req.method === 'POST') {
    const auth = await requireAdmin(req, res)
    if (!auth) return

    const { name, address, printer_config } = req.body || {}
    if (!name) return res.status(400).json({ error: 'El nombre es requerido' })

    const defaultConfig = {
      printer_name:    'POS-80',
      paper_width:     '80mm',
      chars_per_line:  48,
      header_lines:    ['PIROTÉCNICA LA CHISPA', address || ''],
      footer_lines:    ['¡Gracias por su compra!', 'Manipule con responsabilidad'],
      use_qz_tray:     false,
    }

    const { data, error } = await supabaseAdmin
      .from('locations')
      .insert({ name, address, printer_config: printer_config || defaultConfig })
      .select()
      .single()

    if (error) return res.status(500).json({ error: error.message })
    return res.status(201).json(data)
  }

  return res.status(405).json({ error: 'Método no permitido' })
}
