import { supabaseAdmin } from '../supabaseAdmin.js'
import { requireSuperAdmin } from '../auth.js'
import { verifyJwt } from '../jwt.js'

export const SUPPORT_CATEGORIES = ['printer', 'payment', 'inventory', 'auth', 'system', 'other']
export const SUPPORT_PRIORITIES = ['low', 'medium', 'high', 'critical']
export const SUPPORT_STATUSES   = ['open', 'in_progress', 'resolved', 'closed']
export const DEFAULT_SUPPORT_WHATSAPP = process.env.SUPPORT_WHATSAPP_NUMBER || '573000000000'

/** Limpia y normaliza un número telefónico (quita espacios, guiones y prefijo +57 si viene incluido) */
export function cleanPhone(raw) {
  if (!raw) return ''
  let cleaned = String(raw).replace(/[^\d]/g, '')
  if (cleaned.startsWith('57') && cleaned.length > 10) {
    cleaned = cleaned.slice(2)
  }
  return cleaned
}

/** Valida y normaliza el cuerpo de creación de un ticket de soporte. */
export function parseSupportBody(body = {}) {
  const {
    tenant_id,
    tenant_name,
    location_id,
    location_name,
    register_id,
    register_name,
    reported_by_id,
    reported_by_name,
    reported_by_role,
    contact_phone,
    category,
    subcategory,
    description,
    priority = 'medium',
    technical_context = {},
  } = body

  if (!tenant_id) return { error: 'El identificador de empresa (tenant_id) es requerido' }
  if (!tenant_name?.trim()) return { error: 'El nombre de empresa (tenant_name) es requerido' }
  if (!reported_by_name?.trim()) return { error: 'El nombre de quien reporta es requerido' }

  const phone = cleanPhone(contact_phone)
  if (!phone || phone.length < 7) {
    return { error: 'Un número de teléfono de contacto válido es requerido para soporte' }
  }

  if (!SUPPORT_CATEGORIES.includes(category)) {
    return { error: `Categoría inválida. Debe ser una de: ${SUPPORT_CATEGORIES.join(', ')}` }
  }

  const validPriority = SUPPORT_PRIORITIES.includes(priority) ? priority : 'medium'

  return {
    error: null,
    data: {
      tenant_id,
      tenant_name: tenant_name.trim(),
      location_id: location_id || null,
      location_name: location_name?.trim() || null,
      register_id: register_id || null,
      register_name: register_name?.trim() || null,
      reported_by_id: reported_by_id || null,
      reported_by_name: reported_by_name.trim(),
      reported_by_role: reported_by_role || null,
      contact_phone: phone,
      category,
      subcategory: subcategory?.trim() || null,
      description: description?.trim() || null,
      priority: validPriority,
      status: 'open',
      technical_context: typeof technical_context === 'object' && technical_context !== null ? technical_context : {},
    },
  }
}

/** Extrae y valida filtros para el listado de tickets en superadmin. */
export function parseSupportFilters(query = {}) {
  const filters = {}
  if (query.status && (SUPPORT_STATUSES.includes(query.status) || query.status === 'active')) {
    filters.status = query.status
  }
  if (query.priority && SUPPORT_PRIORITIES.includes(query.priority)) {
    filters.priority = query.priority
  }
  if (query.tenant_id) {
    filters.tenant_id = String(query.tenant_id).trim()
  }
  return filters
}

/**
 * POST /api/support/tickets
 * Permite a cualquier usuario de tienda (autenticado o en pantalla de login) crear un ticket de soporte.
 */
export async function supportTicketCreate(req, res) {
  let body = req.body || {}

  // Si trae Authorization Bearer, enriquecer datos con la sesión si no venían en el body
  const authHeader = req.headers['authorization'] || req.headers['Authorization'] || ''
  const token = authHeader.replace(/^Bearer\s+/i, '').trim()
  if (token) {
    try {
      const claims = await verifyJwt(token)
      if (claims?.tenantId && !body.tenant_id) body.tenant_id = claims.tenantId
      if (claims?.sellerId && !body.reported_by_id) body.reported_by_id = claims.sellerId
      if (claims?.locationId && !body.location_id) body.location_id = claims.locationId
    } catch {
      // Token inválido o expirado: se prosigue con los datos provistos en el body
    }
  }

  // Si tenemos tenant_id pero falta tenant_name, consultarlo
  if (body.tenant_id && !body.tenant_name) {
    const { data: tenant } = await supabaseAdmin
      .from('tenants').select('name').eq('id', body.tenant_id).single()
    if (tenant?.name) body.tenant_name = tenant.name
  }

  const { error, data: ticketData } = parseSupportBody(body)
  if (error) return res.status(400).json({ error })

  const { data, error: dbError } = await supabaseAdmin
    .from('support_tickets')
    .insert([ticketData])
    .select('*')
    .single()

  if (dbError) {
    return res.status(500).json({ error: `Error creando ticket de soporte: ${dbError.message}` })
  }

  return res.status(201).json({
    ticket: data,
    support_whatsapp: DEFAULT_SUPPORT_WHATSAPP,
  })
}

/**
 * GET /api/super/support/tickets
 * Lista tickets para la Mesa de Soporte (requiere SuperAdmin).
 */
export async function superSupportTicketsList(req, res) {
  const auth = await requireSuperAdmin(req, res)
  if (!auth) return

  const filters = parseSupportFilters(req.query || {})
  let query = supabaseAdmin
    .from('support_tickets')
    .select('*')
    .order('created_at', { ascending: false })

  if (filters.status) {
    if (filters.status === 'active') {
      query = query.in('status', ['open', 'in_progress'])
    } else {
      query = query.eq('status', filters.status)
    }
  }
  if (filters.priority) {
    query = query.eq('priority', filters.priority)
  }
  if (filters.tenant_id) {
    query = query.eq('tenant_id', filters.tenant_id)
  }

  const limit = Math.min(Math.max(Number(req.query?.limit) || 50, 1), 200)
  query = query.limit(limit)

  const { data, error } = await query
  if (error) return res.status(500).json({ error: error.message })

  return res.status(200).json({
    tickets: data || [],
    support_whatsapp: DEFAULT_SUPPORT_WHATSAPP,
  })
}

/**
 * PATCH /api/super/support/tickets/:id
 * Actualiza estado, asignación o notas de resolución de un ticket.
 */
export async function superSupportTicketPatch(req, res, ticketId) {
  const auth = await requireSuperAdmin(req, res)
  if (!auth) return

  if (!ticketId) return res.status(400).json({ error: 'ID de ticket requerido' })

  const { status, assigned_to, resolution_notes, priority } = req.body || {}
  const updates = { updated_at: new Date().toISOString() }

  if (status !== undefined) {
    if (!SUPPORT_STATUSES.includes(status)) {
      return res.status(400).json({ error: `Estado inválido. Opciones: ${SUPPORT_STATUSES.join(', ')}` })
    }
    updates.status = status
    if (status === 'resolved' || status === 'closed') {
      updates.resolved_at = new Date().toISOString()
      updates.resolved_by = auth.superAdminId
    }
  }

  if (priority !== undefined) {
    if (!SUPPORT_PRIORITIES.includes(priority)) {
      return res.status(400).json({ error: `Prioridad inválida. Opciones: ${SUPPORT_PRIORITIES.join(', ')}` })
    }
    updates.priority = priority
  }

  if (assigned_to !== undefined) updates.assigned_to = assigned_to?.trim() || null
  if (resolution_notes !== undefined) updates.resolution_notes = resolution_notes?.trim() || null

  const { data, error } = await supabaseAdmin
    .from('support_tickets')
    .update(updates)
    .eq('id', ticketId)
    .select('*')
    .single()

  if (error) return res.status(500).json({ error: error.message })
  if (!data) return res.status(404).json({ error: 'Ticket no encontrado' })

  return res.status(200).json({ ticket: data })
}
