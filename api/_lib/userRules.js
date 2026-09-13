import { assignableRoles } from './roles.js'
import { validateUsername, validatePassword } from './passwords.js'

// =====================================================
// PyroVenta — Quién puede crear o modificar a quién.
// Puro: el router carga target/conteos y persiste lo que esto aprueba.
// =====================================================

const PIN_RE = /^\d{4}$/
const deny = (status, error) => ({ ok: false, status, error })

export function checkUserChange({ actor, target, patch, activeOwnerCount = 0 }) {
  const creating = !target
  const allowed = assignableRoles(actor.role)
  if (!allowed.length) return deny(403, 'No tienes permiso para administrar usuarios')

  const role = patch.role ?? target?.role ?? 'seller'

  if (!creating && actor.id === target.id) {
    const changesRole = patch.role !== undefined && patch.role !== target.role
    if (changesRole || patch.location_ids !== undefined || patch.active === false) {
      return deny(403, 'No puedes cambiar tu propio rol, puntos de venta o estado')
    }
  }

  if (!creating && !allowed.includes(target.role)) return deny(403, 'No puedes modificar a este usuario')
  if (!allowed.includes(role)) return deny(403, 'No puedes asignar ese rol')

  // Puntos a guardar: undefined = no cambian
  let locationIds
  if (role === 'owner') {
    locationIds = creating || target.role !== 'owner' ? [] : undefined
  } else if (patch.location_ids !== undefined) {
    locationIds = [...new Set(patch.location_ids)]
  } else if (creating) {
    locationIds = actor.role === 'admin' ? [...actor.locationIds] : []
  }
  const effective = locationIds ?? target?.locationIds ?? []

  if (actor.role === 'admin') {
    const outside = (ids) => ids.some(id => !actor.locationIds.includes(id))
    if (!creating && target.locationIds.length === 0) {
      return deny(403, 'Este usuario no tiene punto asignado: solo el superadministrador puede modificarlo')
    }
    if (!creating && outside(target.locationIds)) {
      return deny(403, 'Este usuario trabaja en otro punto: solo el superadministrador puede modificarlo')
    }
    if (outside(effective)) return deny(403, 'No puedes asignar puntos de venta ajenos')
  }

  if (role !== 'owner' && effective.length === 0) return deny(400, 'Asigna al menos un punto de venta')
  if (role === 'admin' && effective.length !== 1) {
    return deny(400, 'Un administrador debe tener exactamente un punto de venta')
  }

  if (!creating && target.role === 'owner' && target.active
      && (role !== 'owner' || patch.active === false) && activeOwnerCount <= 1) {
    return deny(409, 'Debe quedar al menos un superadministrador activo')
  }

  if (role === 'admin' || role === 'owner') {
    if (creating || patch.username !== undefined || !target.username) {
      const u = validateUsername(patch.username ?? target?.username)
      if (!u.ok) return deny(400, u.error)
    }
    if (creating || patch.password !== undefined || !target.hasPassword) {
      const p = validatePassword(patch.password)
      if (!p.ok) return deny(400, p.error)
    }
  } else if (creating || patch.pin !== undefined || !target.hasPin) {
    if (!PIN_RE.test(patch.pin ?? '')) return deny(400, 'PIN debe ser 4 dígitos')
  }

  return { ok: true, role, locationIds }
}
