/**
 * ¿Hay teclado/mouse a la vista? (any-pointer: fine). En ese caso tiene sentido
 * devolver el foco al escáner después de cada acción; en una pantalla solo
 * táctil enfocar un campo abre el teclado en pantalla y tapa medio catálogo.
 */
export function hasFinePointer() {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    && window.matchMedia('(any-pointer: fine)').matches
}

/** ¿El foco está en un campo donde se escribe? */
export function isTypingTarget(target) {
  return target instanceof Element && Boolean(target.closest('input, textarea, select, [contenteditable="true"]'))
}
