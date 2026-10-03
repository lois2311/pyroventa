import { useId, useState } from 'react'
import { Copy, KeyRound, Link2, MapPin, Pencil, Plus, Users } from 'lucide-react'
import { useAuthStore } from '../../store/authStore.js'
import { api } from '../../lib/api.js'
import { useApi } from '../../hooks/useApi.js'
import { useFieldErrors } from '../../hooks/useFieldErrors.js'
import Modal from '../../components/Modal.jsx'
import PageHeader from '../../components/PageHeader.jsx'
import EmptyState from '../../components/EmptyState.jsx'
import ErrorNotice from '../../components/ErrorNotice.jsx'
import FieldError from '../../components/FieldError.jsx'
import { useToast } from '../../components/Toast.jsx'
import { ROLE_LABELS, assignableRoles } from '../../../api/_lib/roles.js'
import { CARD_GRID, FormError, Initials, SkeletonGrid } from './shared.jsx'
import Select from '../../components/Select.jsx'

// ===========================================================
// TAB: Usuarios
// ===========================================================
export default function UsuariosTab({ locations, isOwner }) {
  const { error: toastError } = useToast()
  const { seller: me } = useAuthStore()
  const sellersQ = useApi('/sellers', { initialData: [] })
  const sellers = sellersQ.data || []
  const [showForm,  setShowForm]  = useState(false)
  const [editSeller,setEditSeller]= useState(null)

  const handleToggle = async (s) => {
    try {
      await api.put(`/sellers/${s.id}`, { active: !s.active })
      sellersQ.refetch()
    } catch (err) { toastError(err.message) }
  }

  const activeCount = sellers.filter(s => s.active).length
  const locNames = (s) => (s.seller_locations || [])
    .map(sl => locations.find(l => l.id === sl.location_id)?.name).filter(Boolean).join(', ')
  const firstLoad = sellersQ.loading && !sellers.length

  return (
    <div className="space-y-6">
      <PageHeader
        title="Usuarios"
        description={firstLoad ? 'Cargando…' : `${sellers.length} usuario${sellers.length !== 1 ? 's' : ''} · ${activeCount} activo${activeCount !== 1 ? 's' : ''}`}
        actions={
          <button type="button" onClick={() => { setEditSeller(null); setShowForm(true) }} className="btn-primary">
            <Plus className="h-4 w-4" /> Nuevo usuario
          </button>
        }
      />

      <ErrorNotice error={sellersQ.error} title="No se pudieron cargar los usuarios" onRetry={sellersQ.refetch} />

      {firstLoad ? (
        <SkeletonGrid count={6} height="h-28" />
      ) : sellers.length === 0 ? (
        !sellersQ.error && <EmptyState icon={Users} title="Aún no hay usuarios" description="Crea vendedores, cajeros y administradores para empezar a operar." />
      ) : (
        <ul className={`${CARD_GRID} transition-opacity ${sellersQ.loading ? 'opacity-60' : ''}`}>
          {sellers.map(s => (
            <li key={s.id} className="card flex flex-col gap-3 bg-surface-300">
              <div className="flex items-start gap-3">
                <Initials name={s.name} />
                <div className="min-w-0 flex-1">
                  <p className={`truncate font-medium ${s.active ? 'text-white' : 'text-gray-400 line-through'}`}>{s.name}</p>
                  <p className="truncate text-xs text-gray-400">
                    {ROLE_LABELS[s.role]}
                    {s.username && <> · <span className="font-mono">{s.username}</span></>}
                  </p>
                </div>
                {!s.active && <span className="badge-cancelled shrink-0">Inactivo</span>}
              </div>

              {isOwner && s.role !== 'owner' && (
                <p className="flex items-start gap-1.5 text-xs text-gray-400">
                  <MapPin className="mt-px h-3.5 w-3.5 shrink-0" />
                  <span>{locNames(s) || 'Sin punto'}</span>
                </p>
              )}

              <div className="mt-auto flex flex-wrap gap-2 border-t border-white/5 pt-3">
                <button type="button" onClick={() => { setEditSeller(s); setShowForm(true) }} className="btn-ghost btn-sm btn-touch-safe">
                  <Pencil className="h-3.5 w-3.5" /> Editar
                </button>
                {s.id !== me?.id && (
                  <button type="button" onClick={() => handleToggle(s)} className={`btn-ghost btn-sm btn-touch-safe ${s.active ? 'text-yellow-400' : 'text-green-400'}`}>
                    {s.active ? 'Desactivar' : 'Activar'}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {showForm && (
        <SellerForm
          seller={editSeller}
          locations={locations}
          onClose={() => setShowForm(false)}
          onSave={() => { sellersQ.refetch(); setShowForm(false) }}
        />
      )}
    </div>
  )
}

function SellerForm({ seller, locations, onClose, onSave }) {
  const { seller: me } = useAuthStore()
  const { error: toastError } = useToast()
  const fid = useId()
  const { errors, validate, clear, describe } = useFieldErrors(fid)
  const roleOptions = [...new Set([...assignableRoles(me?.role), ...(seller?.role ? [seller.role] : [])])]
  const isSelf = seller?.id === me?.id

  const [name,     setName]     = useState(seller?.name || '')
  const [role,     setRole]     = useState(seller?.role || 'seller')
  const [pin,      setPin]      = useState('')
  const [username, setUsername] = useState(seller?.username || '')
  const [password, setPassword] = useState('')
  const [locIds,   setLocIds]   = useState((seller?.seller_locations || []).map(sl => sl.location_id))
  const [saving,   setSaving]   = useState(false)
  const [formError, setFormError] = useState('')
  const [sendLink, setSendLink] = useState(false)   // alta: la persona define su clave con un enlace
  const [link,     setLink]     = useState(null)    // { url, ttl_hours } mostrado tras generarlo
  const [linking,  setLinking]  = useState(false)

  const usesPassword = role === 'admin' || role === 'owner'
  const needsLocations = role !== 'owner'
  const singleLocation = role === 'admin'
  // El admin solo tiene su punto: se asigna solo, sin mostrar selección
  const showLocations = needsLocations && locations.length > 1

  const toggleLoc = (lid) => {
    clear('locations')
    setLocIds(prev => singleLocation ? [lid] : prev.includes(lid) ? prev.filter(x => x !== lid) : [...prev, lid])
  }

  const handleRoleChange = (newRole) => {
    setRole(newRole)
    if (newRole === 'admin') {
      setLocIds(prev => prev.length > 1 ? [prev[0]] : prev)
    } else if (newRole === 'owner') {
      setLocIds([])
    }
  }

  const needsNewPin = !usesPassword && !seller?.has_pin
  const needsNewPass = usesPassword && !seller?.has_password
  const usernameChanged = !seller || username !== (seller?.username || '')

  const handleGenerateLink = async () => {
    setLinking(true); setFormError('')
    try { setLink(await api.post(`/sellers/${seller.id}/password-link`, {}, { retries: 0 })) }
    catch (err) { setFormError(err.message) }
    finally { setLinking(false) }
  }

  const handleSave = async () => {
    setFormError('')
    const ok = validate({
      name: !name.trim() && 'El nombre es requerido',
      username: usesPassword && usernameChanged && username.trim().length < 3 && 'Mínimo 3 caracteres',
      password: usesPassword && needsNewPass && !(sendLink && !seller) && password.length < 10 && 'La contraseña debe tener al menos 10 caracteres',
      pin: !usesPassword && ((needsNewPin && pin.length !== 4) || (pin && pin.length !== 4)) && 'El PIN debe tener 4 dígitos',
      locations: needsLocations && !isSelf && locations.length > 1 && locIds.length === 0 && 'Asigna al menos un punto de venta',
    })
    if (!ok) return

    const body = { name: name.trim() }
    if (!isSelf) body.role = role
    if (usesPassword) {
      if (username !== (seller?.username || '')) body.username = username
      if (password) body.password = password
      if (sendLink && !seller) body.send_link = true
    } else if (pin) {
      body.pin = pin
    }
    if (!isSelf && needsLocations) {
      body.location_ids = locations.length === 1 ? [locations[0].id] : locIds
    }
    setSaving(true)
    try {
      if (seller?.id) await api.put(`/sellers/${seller.id}`, body)
      else {
        const created = await api.post('/sellers', body)
        if (created.setup_link) { setLink(created.setup_link); return }
        if (created.setup_link_error) toastError(created.setup_link_error)
      }
      onSave()
    } catch (err) { setFormError(err.message) }
    finally { setSaving(false) }
  }

  return (
    <Modal
      title={seller ? 'Editar usuario' : 'Nuevo usuario'}
      icon={seller ? Pencil : Users}
      onClose={onClose}
      onSubmit={handleSave}
      footer={<>
        <button type="button" onClick={onClose} className="btn-ghost">Cancelar</button>
        <button type="submit" disabled={saving} className="btn-primary">
          {saving ? 'Guardando...' : 'Guardar'}
        </button>
      </>}
    >
      <div>
        <label htmlFor={`${fid}-name`} className="field-label">Nombre</label>
        <input id={`${fid}-name`} placeholder="Nombre y apellido" value={name} {...describe('name')}
          onChange={e => { setName(e.target.value); clear('name') }} className="input" />
        <FieldError id={`${fid}-name-error`}>{errors.name}</FieldError>
      </div>

      <div>
        <label htmlFor={`${fid}-role`} className="field-label">Rol</label>
        <Select id={`${fid}-role`} value={role} onChange={handleRoleChange} disabled={isSelf}
          options={roleOptions.map(r => ({ value: r, label: ROLE_LABELS[r] }))} />
        {isSelf && <p className="field-hint">No puedes cambiar tu propio rol.</p>}
      </div>

      {usesPassword ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor={`${fid}-username`} className="field-label">Usuario</label>
            <input id={`${fid}-username`} placeholder="ej: admin.norte" value={username} autoComplete="off" autoCapitalize="none"
              {...describe('username')}
              onChange={e => { setUsername(e.target.value.toLowerCase()); clear('username') }} className="input font-mono" />
            <FieldError id={`${fid}-username-error`}>{errors.username}</FieldError>
          </div>
          <div>
            <label htmlFor={`${fid}-password`} className="field-label">{needsNewPass ? 'Contraseña' : 'Nueva contraseña'}</label>
            <input id={`${fid}-password`} type="password" autoComplete="new-password" value={password}
              disabled={sendLink && !seller}
              {...describe('password')}
              onChange={e => { setPassword(e.target.value); clear('password') }}
              placeholder={needsNewPass ? 'Mínimo 10 caracteres' : 'Vacío = no cambiar'}
              className="input" />
            <FieldError id={`${fid}-password-error`}>{errors.password}</FieldError>
          </div>
          {me?.role === 'owner' && (
            <div className="sm:col-span-2">
              {seller ? (
                <button type="button" onClick={handleGenerateLink} disabled={linking} className="btn-ghost btn-sm text-brand-400">
                  <Link2 className="h-3.5 w-3.5" /> {linking ? 'Generando…' : 'Generar enlace de clave inicial'}
                </button>
              ) : (
                <label className="flex cursor-pointer items-start gap-2.5 text-sm text-gray-300">
                  <input type="checkbox" checked={sendLink} onChange={e => { setSendLink(e.target.checked); setPassword(''); clear('password') }}
                    className="mt-0.5 accent-brand-500" />
                  <span>Generar enlace de clave inicial <span className="block text-xs text-gray-400">La persona define su clave en privado. Válido 24 horas, un solo uso.</span></span>
                </label>
              )}
            </div>
          )}
        </div>
      ) : (
        <div>
          <label htmlFor={`${fid}-pin`} className="field-label">{needsNewPin ? 'PIN' : 'Nuevo PIN'}</label>
          <input id={`${fid}-pin`} placeholder={needsNewPin ? '4 dígitos' : 'Vacío = no cambiar'} maxLength={4} value={pin}
            inputMode="numeric" {...describe('pin')}
            onChange={e => { setPin(e.target.value.replace(/\D/g, '').slice(0, 4)); clear('pin') }} className="input font-mono sm:w-40" />
          <FieldError id={`${fid}-pin-error`}>{errors.pin}</FieldError>
        </div>
      )}

      {showLocations && !isSelf && (
        <fieldset aria-describedby={errors.locations ? `${fid}-locations-error` : undefined}>
          <legend className="field-label">{singleLocation ? 'Punto de venta que administra' : 'Puntos de venta asignados'}</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {locations.map((l, i) => (
              <label key={l.id} className="flex min-h-[var(--control-h)] cursor-pointer items-center gap-2.5 rounded-lg border border-white/10 bg-surface-300 px-3 has-[:checked]:border-brand-500/50 has-[:checked]:bg-brand-500/10">
                <input id={i === 0 ? `${fid}-locations` : undefined} type={singleLocation ? 'radio' : 'checkbox'} name="seller-locs"
                  checked={locIds.includes(l.id)} onChange={() => toggleLoc(l.id)} className="accent-brand-500" />
                <span className="text-sm text-gray-300">{l.name}</span>
              </label>
            ))}
          </div>
          <FieldError id={`${fid}-locations-error`}>{errors.locations}</FieldError>
        </fieldset>
      )}

      {role === 'owner' && (
        <p className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
          El superadministrador ve y administra todos los puntos de la empresa.
        </p>
      )}

      <FormError message={formError} />

      {link && <SetupLinkModal link={link} onClose={onSave} />}
    </Modal>
  )
}

function SetupLinkModal({ link, onClose }) {
  const { success: toastSuccess, error: toastError } = useToast()
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link.url)
      toastSuccess('Enlace copiado')
    } catch { toastError('No se pudo copiar: selecciónalo y cópialo a mano') }
  }
  return (
    <Modal title="Enlace de clave inicial" icon={KeyRound} size="md" onClose={onClose} closeOnBackdrop={false}
      footer={<button type="button" onClick={onClose} className="btn-primary">Listo</button>}>
      <p className="text-sm text-gray-300">
        Válido durante {link.ttl_hours} horas y de un solo uso. Compártelo con el administrador: quien lo abra podrá definir la clave.
        Si generas otro, este queda revocado.
      </p>
      <div className="flex gap-2">
        <input readOnly value={link.url} aria-label="Enlace de clave inicial" onFocus={e => e.target.select()} className="input min-w-0 flex-1 font-mono text-xs" />
        <button type="button" onClick={copy} className="btn-ghost shrink-0"><Copy className="h-4 w-4" /> Copiar enlace</button>
      </div>
      <p className="text-xs text-gray-400">Por seguridad, no volverás a ver este enlace después de cerrar esta ventana.</p>
    </Modal>
  )
}
