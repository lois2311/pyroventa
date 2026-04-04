import { supabaseAdmin } from './supabaseAdmin.js'

/**
 * Verifica el token Bearer del header Authorization.
 * Token = base64(sellerId:locationId)
 * @throws Error si el token es inválido o el seller está inactivo
 */
export async function verifyToken(req) {
  const authHeader = req.headers['authorization'] || req.headers['Authorization'] || ''
  const token = authHeader.replace(/^Bearer\s+/i, '').trim()
  if (!token) throw new Error('Token no proporcionado')

  let sellerId, locationId
  try {
    const decoded = Buffer.from(token, 'base64').toString('utf8')
    ;[sellerId, locationId] = decoded.split(':')
  } catch {
    throw new Error('Token inválido')
  }

  if (!sellerId || !locationId) throw new Error('Token inválido')

  const { data: seller, error } = await supabaseAdmin
    .from('sellers')
    .select('id, name, role, active')
    .eq('id', sellerId)
    .eq('active', true)
    .single()

  if (error || !seller) throw new Error('Token inválido o vendedor inactivo')

  return { seller, locationId }
}

/**
 * Middleware: requiere token válido. Retorna {seller, locationId} o responde 401.
 */
export async function requireAuth(req, res) {
  try {
    return await verifyToken(req)
  } catch (err) {
    res.status(401).json({ error: err.message || 'No autorizado' })
    return null
  }
}

/**
 * Middleware: requiere rol admin. Retorna {seller, locationId} o responde 403.
 */
export async function requireAdmin(req, res) {
  const auth = await requireAuth(req, res)
  if (!auth) return null
  if (auth.seller.role !== 'admin') {
    res.status(403).json({ error: 'Se requiere rol de administrador' })
    return null
  }
  return auth
}
