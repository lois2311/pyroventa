import { AlertCircle } from 'lucide-react'

/** Mensaje de error bajo un campo; `id` lo enlaza con aria-describedby. */
export default function FieldError({ id, children }) {
  if (!children) return null
  return (
    <p id={id} className="field-error">
      <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span>{children}</span>
    </p>
  )
}
