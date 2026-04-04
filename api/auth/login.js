import { supabaseAdmin } from '../_lib/supabaseAdmin.js'
import { handleCors }    from '../_lib/cors.js'

export default async function handler(req, res) {
  if (handleCors(req, res)) return

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' })
  }

  const { pin, location_id } = req.body || {}

  if (!pin || !location_id) {
    return res.status(400).json({ error: 'PIN y punto de venta son requeridos' })
  }

  // Buscar seller por PIN que esté asignado a este punto de venta
  // El admin (role='admin') puede acceder a cualquier punto de venta
  const { data: sellers, error } = await supabaseAdmin
    .from('sellers')
    .select('id, name, pin, role, active, seller_locations!inner(location_id)')
    .eq('pin', pin)
    .eq('active', true)
    .eq('seller_locations.location_id', location_id)

  if (error) {
    console.error('[login] DB error:', error)
    return res.status(500).json({ error: 'Error interno del servidor' })
  }

  // Si no encontró por location, intentar como admin (que tiene acceso a todos)
  let seller = sellers?.[0]

  if (!seller) {
    // Verificar si es admin con ese PIN (sin restricción de location)
    const { data: adminSellers } = await supabaseAdmin
      .from('sellers')
      .select('id, name, pin, role, active')
      .eq('pin', pin)
      .eq('role', 'admin')
      .eq('active', true)
      .limit(1)

    seller = adminSellers?.[0]
  }

  if (!seller) {
    return res.status(401).json({ error: 'PIN incorrecto o no autorizado para este punto de venta' })
  }

  // Cargar datos del punto de venta
  const { data: location, error: locErr } = await supabaseAdmin
    .from('locations')
    .select('id, name, address, printer_config')
    .eq('id', location_id)
    .eq('active', true)
    .single()

  if (locErr || !location) {
    return res.status(404).json({ error: 'Punto de venta no encontrado' })
  }

  // Generar token simple: base64(sellerId:locationId)
  const tokenPayload = `${seller.id}:${location_id}`
  const token = Buffer.from(tokenPayload).toString('base64')

  return res.status(200).json({
    seller:   { id: seller.id, name: seller.name, role: seller.role },
    location: { id: location.id, name: location.name, address: location.address, printer_config: location.printer_config },
    token,
  })
}
