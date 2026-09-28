import { useCallback, useState } from 'react'

/**
 * Errores de validación por campo, mostrados junto al campo (no en un toast
 * que desaparece). Convención de ids: el campo es `${prefix}-${name}` y su
 * mensaje `${prefix}-${name}-error`.
 *
 *   const { errors, validate, clear, describe } = useFieldErrors(fid)
 *   if (!validate({ name: !name.trim() && 'El nombre es requerido' })) return
 *   <input id={`${fid}-name`} {...describe('name')} onChange={… clear('name')} />
 *   <FieldError id={`${fid}-name-error`}>{errors.name}</FieldError>
 *
 * `validate` recibe { campo: mensaje | falsy }, guarda los que fallan, enfoca
 * el primero y devuelve true si no hay errores.
 */
export function useFieldErrors(prefix) {
  const [errors, setErrors] = useState({})

  const validate = useCallback((checks) => {
    const failed = Object.fromEntries(Object.entries(checks).filter(([, msg]) => Boolean(msg)))
    setErrors(failed)
    const first = Object.keys(failed)[0]
    if (first) document.getElementById(`${prefix}-${first}`)?.focus()
    return !first
  }, [prefix])

  const clear = useCallback((name) => {
    setErrors(e => (e[name] ? { ...e, [name]: undefined } : e))
  }, [])

  const describe = useCallback((name) => (errors[name]
    ? { 'aria-invalid': true, 'aria-describedby': `${prefix}-${name}-error` }
    : {}), [errors, prefix])

  return { errors, validate, clear, describe, setErrors }
}
