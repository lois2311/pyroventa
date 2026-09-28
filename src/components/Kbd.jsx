/**
 * Tecla de atajo visible. Oculta en pantallas táctiles (ver `.kbd` en
 * index.css): sin teclado físico solo ocuparía espacio. aria-hidden porque el
 * atajo se anuncia con aria-keyshortcuts en el control al que pertenece.
 */
export default function Kbd({ children, className = '' }) {
  return <kbd aria-hidden="true" className={`kbd ${className}`}>{children}</kbd>
}
