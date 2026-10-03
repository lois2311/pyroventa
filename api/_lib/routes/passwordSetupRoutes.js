import { supabaseAdmin } from '../supabaseAdmin.js'
import { requireCan } from '../auth.js'
import { clientIp, rejectIfLocked, recordFailedAttempt } from '../loginLock.js'
import { hashPassword, validatePassword } from '../passwords.js'
import { generateSetupToken, hashToken, tokenUsable, TOKEN_RE, SETUP_TTL_HOURS, INVALID_LINK_MESSAGE } from '../passwordSetup.js'

const MIGRATION_HINT = 'Falta la migración: ejecuta supabase/migrations/2026-10-02_password_setup_tokens.sql en Supabase'

function frontendBase(req) {
  const env = process.env.FRONTEND_URL
  if (env) return env.replace(/\/+$/, '')
  const proto = req.headers['x-forwarded-proto'] || 'https'
  return `${proto}://${req.headers['x-forwarded-host'] || req.headers.host}`
}

/** Revoca los enlaces pendientes del usuario y crea uno nuevo. Devuelve la URL con el token en crudo. */
export async function issueSetupLink(req, tenantId, userId, createdBy) {
  await supabaseAdmin.from('password_setup_tokens').update({ revoked_at: new Date().toISOString() })
    .eq('user_id', userId).is('used_at', null).is('revoked_at', null)
  const { token, tokenHash, expiresAt } = generateSetupToken()
  const { error } = await supabaseAdmin.from('password_setup_tokens').insert({
    tenant_id: tenantId, user_id: userId, token_hash: tokenHash, expires_at: expiresAt, created_by: createdBy,
  })
  if (error) throw new Error(MIGRATION_HINT)
  return { url: `${frontendBase(req)}/auth/establecer-clave/${token}`, expires_at: expiresAt, ttl_hours: SETUP_TTL_HOURS }
}

// POST /sellers/:id/password-link — solo superadministrador de la empresa
export async function passwordLinkCreate(req, res, id) {
  const auth = await requireCan(req, res, 'manage_admins'); if (!auth) return
  const { data: user } = await supabaseAdmin.from('sellers').select('id, role, active')
    .eq('id', id).eq('tenant_id', auth.tenantId).maybeSingle()
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' })
  if (!user.active || !['admin', 'owner'].includes(user.role)) {
    return res.status(400).json({ error: 'El enlace solo aplica a administradores activos' })
  }
  try {
    return res.status(201).json(await issueSetupLink(req, auth.tenantId, user.id, auth.seller.id))
  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
}

async function lookupToken(token) {
  if (!TOKEN_RE.test(String(token))) return null
  const { data: row } = await supabaseAdmin.from('password_setup_tokens')
    .select('user_id, expires_at, used_at, revoked_at')
    .eq('token_hash', hashToken(token)).maybeSingle()
  return tokenUsable(row) ? row : null
}

// GET /auth/setup-password/validate/:token — público
export async function setupPasswordValidate(req, res, token) {
  const lockKey = `setup:${clientIp(req)}`
  if (await rejectIfLocked(supabaseAdmin, lockKey, res)) return
  const row = await lookupToken(token)
  const { data: user } = row
    ? await supabaseAdmin.from('sellers').select('name, username, active, role').eq('id', row.user_id).maybeSingle()
    : { data: null }
  if (!user?.active || !['admin', 'owner'].includes(user.role)) {
    await recordFailedAttempt(supabaseAdmin, lockKey)
    return res.status(400).json({ error: INVALID_LINK_MESSAGE })
  }
  return res.status(200).json({ name: user.name, username: user.username, expires_at: row.expires_at })
}

// POST /auth/setup-password/submit — público
export async function setupPasswordSubmit(req, res) {
  const { token, password, confirmPassword } = req.body || {}
  const lockKey = `setup:${clientIp(req)}`
  if (await rejectIfLocked(supabaseAdmin, lockKey, res)) return
  if (!TOKEN_RE.test(String(token))) {
    await recordFailedAttempt(supabaseAdmin, lockKey)
    return res.status(400).json({ error: INVALID_LINK_MESSAGE })
  }
  const v = validatePassword(password)
  if (!v.ok) return res.status(400).json({ error: v.error })
  if (password !== confirmPassword) return res.status(400).json({ error: 'Las contraseñas no coinciden' })

  // Función SQL atómica: consume el token y guarda el hash en la misma transacción, o no hace nada
  const { data: userId, error } = await supabaseAdmin.rpc('consume_password_setup', {
    p_token_hash: hashToken(token), p_password_hash: hashPassword(password),
  })
  if (error && !/setup_target_invalid/.test(error.message)) return res.status(500).json({ error: 'Error interno del servidor' })
  if (error || !userId) {
    await recordFailedAttempt(supabaseAdmin, lockKey)
    return res.status(400).json({ error: INVALID_LINK_MESSAGE })
  }
  return res.status(200).json({ ok: true })
}
