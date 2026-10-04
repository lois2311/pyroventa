import { Keyboard } from 'lucide-react'
import Modal from './Modal.jsx'

const SECTIONS = {
  general: {
    title: 'En toda la app',
    rows: [
      [['F1'], 'Vender'],
      [['F2'], 'Inventario'],
      [['F3'], 'Cierre de caja'],
      [['F4'], 'Reportes'],
      [['/'], 'Ir al buscador o al código'],
      [['F9'], 'Mesa de soporte y ayuda'],
      [['?'], 'Ver esta ayuda'],
    ],
  },
  vender: {
    title: 'Vender',
    rows: [
      [['Enter'], 'Agregar el producto encontrado (una sola coincidencia)'],
      [['↓'], 'Del buscador al catálogo'],
      [['+', '−'], 'Sumar o restar una unidad a la línea activa'],
      [['↑', '↓'], 'Cambiar la línea activa (con el buscador vacío)'],
      [['Supr'], 'Quitar la línea activa'],
      [['F8'], 'Pausar la venta / retomar la última'],
      [['F12'], 'Generar factura'],
      [['Esc'], 'Cancelar la venta (pide confirmación)'],
      [['Enter', 'Esc'], 'Con el código en pantalla: nueva venta'],
    ],
  },
  caja: {
    title: 'Caja',
    rows: [
      [['1–9'], 'Elegir caja al empezar el turno'],
      [['0–9'], 'Código de factura: busca solo al 4.º dígito'],
      [['1', '2', '3'], 'Efectivo · Transferencia · Datáfono'],
      [['N', 'D', 'B'], 'Nequi · Daviplata · Bancolombia'],
      [['F6'], 'Descuento'],
      [['F7'], 'Cliente u observaciones'],
      [['Enter', 'F12'], 'Cobrar'],
      [['Esc'], 'Salir del campo · cancelar la venta'],
      [['P'], 'Imprimir recibo (después de cobrar)'],
    ],
  },
}

/** Hoja de atajos (tecla "?"). `context` pone primero la sección de la pantalla actual. */
export default function ShortcutsHelp({ context, onClose }) {
  const order = context && SECTIONS[context]
    ? [context, ...Object.keys(SECTIONS).filter(k => k !== context)]
    : Object.keys(SECTIONS)

  return (
    <Modal title="Atajos de teclado" icon={Keyboard} size="lg" onClose={onClose}
      footer={<button type="button" onClick={onClose} className="btn-primary" data-autofocus>Entendido</button>}
    >
      <div className="grid gap-5 sm:grid-cols-2">
        {order.map(key => (
          <section key={key} className={key === context ? 'sm:col-span-2' : ''}>
            <h3 className="eyebrow mb-2">{SECTIONS[key].title}</h3>
            <dl className="divide-y divide-white/5 rounded-lg border border-white/5 bg-surface-300">
              {SECTIONS[key].rows.map(([keys, label]) => (
                <div key={label} className="flex items-center justify-between gap-3 px-3 py-2">
                  <dt className="text-sm text-gray-300">{label}</dt>
                  <dd className="flex shrink-0 gap-1">
                    {keys.map(k => (
                      // Visibles también en pantallas táctiles: aquí son el contenido
                      <kbd key={k} className="inline-flex h-6 min-w-6 items-center justify-center rounded border border-white/15 bg-surface-500/60 px-1.5 font-mono text-kbd font-medium text-gray-200">{k}</kbd>
                    ))}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </Modal>
  )
}
