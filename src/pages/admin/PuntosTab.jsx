import { useId, useState } from 'react'
import { MapPin, Pencil, Plus, Printer, Sliders } from 'lucide-react'
import { api } from '../../lib/api.js'
import { useFieldErrors } from '../../hooks/useFieldErrors.js'
import Modal from '../../components/Modal.jsx'
import PageHeader from '../../components/PageHeader.jsx'
import EmptyState from '../../components/EmptyState.jsx'
import FieldError from '../../components/FieldError.jsx'
import LocationCatalogModal from '../../components/LocationCatalogModal.jsx'
import { useToast } from '../../components/Toast.jsx'
import { CARD_GRID, FormError } from './shared.jsx'
import Select from '../../components/Select.jsx'

// ===========================================================
// TAB: Puntos de venta
// La lista vive en AdminPage (la comparten varias pestañas): aquí solo se
// pide recargarla con onChanged tras crear, editar o desactivar.
// ===========================================================
export default function PuntosTab({ locations, onChanged, isOwner }) {
  const { error: toastError } = useToast()
  const [showForm,   setShowForm]   = useState(false)
  const [editLoc,    setEditLoc]    = useState(null)
  const [catalogLoc, setCatalogLoc] = useState(null)

  const handleToggle = async (loc) => {
    try {
      await api.put(`/locations/${loc.id}`, { active: !loc.active })
      onChanged()
    } catch (err) { toastError(err.message) }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Puntos de venta"
        description={`${locations.length} punto${locations.length !== 1 ? 's' : ''} de venta`}
        actions={isOwner && (
          <button type="button" onClick={() => { setEditLoc(null); setShowForm(true) }} className="btn-primary">
            <Plus className="h-4 w-4" /> Nuevo punto
          </button>
        )}
      />

      {locations.length === 0 ? (
        <EmptyState icon={MapPin} title="Sin puntos de venta" description="Crea el primero para que el personal pueda iniciar sesión." />
      ) : (
        <ul className={CARD_GRID}>
          {locations.map(loc => (
            <li key={loc.id} className="card flex flex-col gap-3 bg-surface-300">
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-500/10 text-brand-400">
                  <MapPin className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className={`truncate font-medium ${loc.active ? 'text-white' : 'text-gray-400 line-through'}`}>{loc.name}</p>
                  {loc.address && <p className="truncate text-xs text-gray-400">{loc.address}</p>}
                  {loc.printer_config?.paper_width && (
                    <p className="mt-1 inline-flex items-center gap-1 text-xs text-gray-400">
                      <Printer className="h-3 w-3" /> Papel {loc.printer_config.paper_width}
                    </p>
                  )}
                </div>
                {!loc.active && <span className="badge-cancelled shrink-0">Inactivo</span>}
              </div>

              <div className="mt-auto flex flex-wrap gap-2 border-t border-white/5 pt-3">
                {isOwner && (
                  <button
                    type="button"
                    onClick={() => setCatalogLoc(loc)}
                    className="btn-ghost btn-sm btn-touch-safe text-brand-400 hover:text-brand-300"
                    title="Configurar precios diferenciales y productos habilitados (Superadmin)"
                  >
                    <Sliders className="h-3.5 w-3.5" /> Precios y catálogo
                  </button>
                )}
                <button type="button" onClick={() => { setEditLoc(loc); setShowForm(true) }} className="btn-ghost btn-sm btn-touch-safe">
                  <Pencil className="h-3.5 w-3.5" /> Editar
                </button>
                {isOwner && (
                  <button type="button" onClick={() => handleToggle(loc)} className="btn-ghost btn-sm btn-touch-safe text-yellow-400">
                    {loc.active ? 'Desactivar' : 'Activar'}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {catalogLoc && (
        <LocationCatalogModal
          location={catalogLoc}
          onClose={() => setCatalogLoc(null)}
          onSaved={onChanged}
        />
      )}

      {showForm && (
        <LocationForm
          location={editLoc}
          onClose={() => setShowForm(false)}
          onSave={() => { onChanged(); setShowForm(false) }}
          isOwner={isOwner}
        />
      )}
    </div>
  )
}

function LocationForm({ location, onClose, onSave, isOwner }) {
  const fid = useId()
  const { errors, validate, clear, describe } = useFieldErrors(fid)
  const [name,   setName]   = useState(location?.name || '')
  const [addr,   setAddr]   = useState(location?.address || '')
  const [width,  setWidth]  = useState(location?.printer_config?.paper_width || '80mm')
  const [qz,     setQz]     = useState(location?.printer_config?.use_qz_tray ?? false)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  const handleSave = async () => {
    setFormError('')
    if (!validate({ name: !name.trim() && 'El nombre es requerido' })) return
    setSaving(true)
    const printer_config = {
      paper_width:    width,
      chars_per_line: width === '80mm' ? 48 : 32,
      use_qz_tray:    qz,
      header_lines:   ['PIROTÉCNICA LA CHISPA', addr || name],
      footer_lines:   ['¡Gracias por su compra!', 'Manipule con responsabilidad'],
    }
    try {
      if (location?.id) {
        await api.put(`/locations/${location.id}`, isOwner ? { name, address: addr, printer_config } : { printer_config })
      } else {
        await api.post('/locations', { name, address: addr, printer_config })
      }
      onSave()
    } catch (err) { setFormError(err.message) }
    finally { setSaving(false) }
  }

  return (
    <Modal
      title={location ? 'Editar punto de venta' : 'Nuevo punto de venta'}
      icon={MapPin}
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
        <input id={`${fid}-name`} placeholder="Ej: Local Principal, Stand Norte" value={name} {...describe('name')}
          onChange={e => { setName(e.target.value); clear('name') }} className="input" disabled={!isOwner} />
        <FieldError id={`${fid}-name-error`}>{errors.name}</FieldError>
      </div>
      <div>
        <label htmlFor={`${fid}-addr`} className="field-label">Dirección <span className="font-normal">(opcional)</span></label>
        <input id={`${fid}-addr`} placeholder="Calle, número, barrio" value={addr} onChange={e => setAddr(e.target.value)} className="input" disabled={!isOwner} />
      </div>
      <div>
        <label htmlFor={`${fid}-width`} className="field-label">Ancho del papel</label>
        <Select id={`${fid}-width`} value={width} onChange={setWidth} options={[
          { value: '80mm', label: '80mm (48 caracteres)' },
          { value: '58mm', label: '58mm (32 caracteres)' },
        ]} />
      </div>
      <label className="flex cursor-pointer items-center gap-2.5">
        <input type="checkbox" checked={qz} onChange={e => setQz(e.target.checked)} className="h-4 w-4 accent-brand-500" />
        <span className="text-sm text-gray-300">Usar QZ Tray para impresión térmica</span>
      </label>
      <FormError message={formError} />
    </Modal>
  )
}
