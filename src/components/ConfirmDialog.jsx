import { createContext, useCallback, useContext, useId, useState } from 'react'
import { AlertTriangle, HelpCircle } from 'lucide-react'
import Modal from './Modal.jsx'
import FieldError from './FieldError.jsx'

const ConfirmContext = createContext(null)

/**
 * Confirmaciones con el diseño de la app en lugar de window.confirm/prompt
 * (que en móvil se ven como alertas del sistema, no se pueden estilizar ni
 * validar, y bloquean todo el hilo de la página).
 *
 *   const confirm = useConfirm()
 *   if (!await confirm({ title: '¿Eliminar…?', tone: 'danger', confirmLabel: 'Eliminar' })) return
 *
 *   // Con campo (reemplaza a window.prompt): devuelve el texto o null
 *   const reason = await confirm({ title: 'Devolución', input: { label: 'Motivo', required: true } })
 */
export function ConfirmProvider({ children }) {
  const [dialog, setDialog] = useState(null) // { options, resolve }

  const confirm = useCallback((options) => new Promise(resolve => setDialog({ options, resolve })), [])

  const resolveWith = (value) => {
    dialog?.resolve(value)
    setDialog(null)
  }

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {dialog && <ConfirmDialog {...dialog.options} onResolve={resolveWith} />}
    </ConfirmContext.Provider>
  )
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext)
  if (!ctx) throw new Error('useConfirm debe usarse dentro de <ConfirmProvider>')
  return ctx
}

function ConfirmDialog({
  title, description, confirmLabel = 'Confirmar', cancelLabel = 'Cancelar',
  tone = 'default', input, onResolve,
}) {
  const fid = useId()
  const [value, setValue] = useState(input?.defaultValue || '')
  const [error, setError] = useState('')
  const danger = tone === 'danger'
  const cancelValue = input ? null : false

  const submit = () => {
    if (!input) return onResolve(true)
    const v = value.trim()
    if (input.required && !v) {
      setError(input.requiredMessage || 'Este campo es obligatorio')
      document.getElementById(`${fid}-input`)?.focus()
      return
    }
    onResolve(v)
  }

  const fieldProps = {
    id: `${fid}-input`,
    value,
    placeholder: input?.placeholder,
    onChange: e => { setValue(e.target.value); setError('') },
    className: 'input',
    'aria-invalid': error ? true : undefined,
    'aria-describedby': error ? `${fid}-input-error` : undefined,
  }

  return (
    <Modal
      title={title}
      description={description}
      icon={danger ? AlertTriangle : HelpCircle}
      iconClassName={danger ? 'text-red-400' : 'text-brand-400'}
      size="sm"
      onClose={() => onResolve(cancelValue)}
      onSubmit={submit}
      footer={<>
        <button type="button" onClick={() => onResolve(cancelValue)} className="btn-ghost">{cancelLabel}</button>
        <button type="submit" className={danger ? 'btn-danger' : 'btn-primary'}>{confirmLabel}</button>
      </>}
    >
      {input ? (
        <div>
          <label htmlFor={`${fid}-input`} className="field-label">{input.label}</label>
          {input.multiline
            ? <textarea rows={3} {...fieldProps} className="input resize-none" autoFocus />
            : <input type="text" {...fieldProps} autoFocus />}
          <FieldError id={`${fid}-input-error`}>{error}</FieldError>
        </div>
      ) : null}
    </Modal>
  )
}
