import { supabaseAdmin } from '../supabaseAdmin.js'
import { requireAuth, requireCan } from '../auth.js'
import { locationInScope } from '../scope.js'
import { scopedLocation, denyOutOfScope, loadScopedRegister } from '../scopedLocation.js'
import { checkUserChange } from '../userRules.js'
import { randomBytes } from 'node:crypto'
import { hashPassword, normalizeUsername } from '../passwords.js'
import { issueSetupLink } from './passwordSetupRoutes.js'

// =====================================================
// USUARIOS (tabla sellers)
// =====================================================
const USER_COLS = 'id, name, role, active, created_at, username, pin, password_hash, seller_locations(location_id)'

/** Nunca devolver PIN ni hash al navegador. */
const publicUser = ({ pin, password_hash, ...u }) => ({ ...u, has_pin: !!pin, has_password: !!password_hash })

async function loadPublicUser(tenantId, id) {
  const { data } = await supabaseAdmin.from('sellers').select(USER_COLS).eq('id', id).eq('tenant_id', tenantId).single()
  return data ? publicUser(data) : null
}

/**
 * Columnas de credenciales que aplican al rol final.
 * `currentRole` (rol antes del cambio, solo en edición) permite borrar
 * usuario/hash al degradar admin/owner -> seller/cashier: si no se limpian,
 * una re-promoción posterior restaura en silencio la contraseña anterior.
 */
function credentialColumns(role, patch, currentRole) {
  const c = {}
  if (role === 'admin' || role === 'owner') {
    if (patch.username !== undefined) c.username = normalizeUsername(patch.username)
    if (patch.password) c.password_hash = hashPassword(patch.password)
  } else {
    if (patch.pin !== undefined) c.pin = patch.pin
    if (currentRole !== undefined && currentRole !== role) {
      c.username = null
      c.password_hash = null
    }
  }
  return c
}

const actorOf = (auth) => ({ id: auth.seller.id, role: auth.seller.role, locationIds: auth.scope.locationIds })
const duplicateUsername = (e) => e?.code === '23505'

export async function sellersGet(req, res) {
  const auth = await requireCan(req, res, 'manage_staff'); if (!auth) return
  const location_id = scopedLocation(auth, req.query.location_id, res, { allowAll: true })
  if (location_id === undefined) return
  const { data, error } = await supabaseAdmin.from('sellers').select(USER_COLS)
    .eq('tenant_id', auth.tenantId).order('name')
  if (error) return res.status(500).json({ error: error.message })
  const isOwner = auth.seller.role === 'owner'
  const rows = (data || []).filter(u => {
    if (!isOwner && !['seller', 'cashier'].includes(u.role)) return false
    const locs = (u.seller_locations || []).map(sl => sl.location_id)
    if (location_id) return locs.includes(location_id)
    return isOwner || locs.some(l => locationInScope(auth.scope, l))
  })
  return res.status(200).json(rows.map(publicUser))
}

export async function sellersCreate(req, res) {
  const auth = await requireCan(req, res, 'manage_staff'); if (!auth) return
  const body = { ...(req.body || {}) }
  if (!String(body.name || '').trim()) return res.status(400).json({ error: 'El nombre es requerido' })
  // Alta con enlace: la clave inicial es aleatoria y nadie la conoce; la persona define la suya con el enlace
  const wantsLink = body.send_link === true && ['admin', 'owner'].includes(body.role)
  if (wantsLink) body.password = randomBytes(24).toString('hex')
  const verdict = checkUserChange({ actor: actorOf(auth), target: null, patch: body })
  if (!verdict.ok) return res.status(verdict.status).json({ error: verdict.error })
  if (verdict.locationIds.some(l => !locationInScope(auth.scope, l))) {
    return res.status(403).json({ error: 'Referencia inválida para esta empresa' })
  }

  const { data: created, error } = await supabaseAdmin.from('sellers')
    .insert({ tenant_id: auth.tenantId, name: String(body.name).trim(), role: verdict.role, ...credentialColumns(verdict.role, body) })
    .select('id').single()
  if (error) {
    return duplicateUsername(error)
      ? res.status(409).json({ error: 'Ese nombre de usuario ya existe' })
      : res.status(500).json({ error: error.message })
  }
  if (verdict.locationIds.length) {
    const { error: locErr } = await supabaseAdmin.from('seller_locations')
      .insert(verdict.locationIds.map(lid => ({ tenant_id: auth.tenantId, seller_id: created.id, location_id: lid })))
    if (locErr) return res.status(500).json({ error: locErr.message })
  }
  const user = await loadPublicUser(auth.tenantId, created.id)
  if (!wantsLink) return res.status(201).json(user)
  try {
    return res.status(201).json({ ...user, setup_link: await issueSetupLink(req, auth.tenantId, created.id, auth.seller.id) })
  } catch (e) {
    // El usuario ya existe: se avisa y el enlace se genera aparte desde "Editar"
    return res.status(201).json({ ...user, setup_link_error: e.message })
  }
}

async function updateUser(auth, id, body, res) {
  if (body.active !== undefined && typeof body.active !== 'boolean') {
    return res.status(400).json({ error: 'active debe ser verdadero o falso' })
  }
  const { data: row } = await supabaseAdmin.from('sellers')
    .select('id, role, active, username, pin, password_hash, seller_locations(location_id)')
    .eq('id', id).eq('tenant_id', auth.tenantId).single()
  if (!row) return res.status(404).json({ error: 'Usuario no encontrado' })

  const target = {
    id: row.id, role: row.role, active: row.active, username: row.username,
    hasPassword: !!row.password_hash, hasPin: !!row.pin,
    locationIds: (row.seller_locations || []).map(sl => sl.location_id),
  }
  let activeOwnerCount = 0
  if (row.role === 'owner') {
    const { count } = await supabaseAdmin.from('sellers').select('id', { count: 'exact', head: true })
      .eq('tenant_id', auth.tenantId).eq('role', 'owner').eq('active', true)
    activeOwnerCount = count || 0
  }

  const verdict = checkUserChange({ actor: actorOf(auth), target, patch: body, activeOwnerCount })
  if (!verdict.ok) return res.status(verdict.status).json({ error: verdict.error })
  if (verdict.locationIds?.some(l => !locationInScope(auth.scope, l))) {
    return res.status(403).json({ error: 'Referencia inválida para esta empresa' })
  }

  const u = credentialColumns(verdict.role, body, row.role)
  if (body.name !== undefined) {
    if (!String(body.name).trim()) return res.status(400).json({ error: 'El nombre es requerido' })
    u.name = String(body.name).trim()
  }
  if (body.role !== undefined)   u.role = verdict.role
  if (body.active !== undefined) u.active = body.active

  if (Object.keys(u).length) {
    const { error } = await supabaseAdmin.from('sellers').update(u).eq('id', id).eq('tenant_id', auth.tenantId)
    if (error) {
      return duplicateUsername(error)
        ? res.status(409).json({ error: 'Ese nombre de usuario ya existe' })
        : res.status(500).json({ error: error.message })
    }
  }
  if (verdict.locationIds) {
    const { error: delErr } = await supabaseAdmin.from('seller_locations')
      .delete().eq('seller_id', id).eq('tenant_id', auth.tenantId)
    if (delErr) return res.status(500).json({ error: delErr.message })
    if (verdict.locationIds.length) {
      const { error: insErr } = await supabaseAdmin.from('seller_locations')
        .insert(verdict.locationIds.map(lid => ({ tenant_id: auth.tenantId, seller_id: id, location_id: lid })))
      if (insErr) return res.status(500).json({ error: insErr.message })
    }
  }
  return res.status(200).json(await loadPublicUser(auth.tenantId, id))
}

export async function sellersUpdate(req, res, id) {
  const auth = await requireCan(req, res, 'manage_staff'); if (!auth) return
  return updateUser(auth, id, req.body || {}, res)
}

// Desactivar pasa por las mismas reglas que editar (último owner, uno mismo, alcance)
export async function sellersDelete(req, res, id) {
  const auth = await requireCan(req, res, 'manage_staff'); if (!auth) return
  return updateUser(auth, id, { active: false }, res)
}

// =====================================================
// REGISTERS
// =====================================================
export async function registersGet(req, res) {
  const auth = await requireAuth(req, res); if (!auth) return
  const location_id = scopedLocation(auth, req.query.location_id, res, { allowAll: true })
  if (location_id === undefined) return
  let q = supabaseAdmin.from('registers')
    .select('id, name, location_id, active, created_at')
    .eq('tenant_id', auth.tenantId).eq('active', true).order('name')
  q = location_id ? q.eq('location_id', location_id) : q.in('location_id', auth.scope.locationIds)
  const { data, error } = await q
  if (error) return res.status(500).json({ error: error.message })
  return res.status(200).json(data || [])
}

export async function registersCreate(req, res) {
  const auth = await requireCan(req, res, 'manage_registers'); if (!auth) return
  const { name, location_id } = req.body || {}
  if (!name?.trim() || !location_id) return res.status(400).json({ error: 'name y location_id requeridos' })
  if (denyOutOfScope(auth, location_id, res)) return
  const { data, error } = await supabaseAdmin.from('registers')
    .insert({ tenant_id: auth.tenantId, name: name.trim(), location_id, active: true }).select().single()
  if (error) return res.status(500).json({ error: error.message })
  return res.status(201).json(data)
}

export async function registersUpdate(req, res, id) {
  const auth = await requireCan(req, res, 'manage_registers'); if (!auth) return
  if (!(await loadScopedRegister(auth, id, res))) return
  const { name, active } = req.body || {}
  const u = {}
  if (name !== undefined) u.name = name.trim()
  if (active !== undefined) u.active = active
  const { data, error } = await supabaseAdmin.from('registers')
    .update(u).eq('id', id).eq('tenant_id', auth.tenantId).select().single()
  if (error) return res.status(500).json({ error: error.message })
  return res.status(200).json(data)
}

export async function registersDelete(req, res, id) {
  const auth = await requireCan(req, res, 'manage_registers'); if (!auth) return
  if (!(await loadScopedRegister(auth, id, res))) return
  await supabaseAdmin.from('registers').update({ active: false }).eq('id', id).eq('tenant_id', auth.tenantId)
  return res.status(200).json({ ok: true })
}
