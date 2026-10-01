import { useEffect, useRef } from 'react'
import { Plus, WifiOff } from 'lucide-react'
import { formatCOP } from '../lib/format.js'
import Kbd from './Kbd.jsx'

/**
 * Código de la factura recién generada.
 * `autoFocus`: enfoca "Nueva venta" (panel de escritorio), así Enter sigue.
 * `shortcuts`: muestra las teclas (Enter / Esc las escucha VendedorPage).
 */
export default function CodeDisplay({ invoice, onNewSale, autoFocus = false, shortcuts = false }) {
  const newSaleRef = useRef(null)
  useEffect(() => {
    if (autoFocus) newSaleRef.current?.focus()
  }, [autoFocus])

  if (!invoice) return null

  const digits = String(invoice.code).split('')

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 text-center animate-fade-in">

      {/* Etiqueta */}
      <p className="eyebrow mb-3 text-sm tracking-widest">
        Código de factura
      </p>

      {/* Código — la pieza central. El borde late dos veces y se queda quieto. */}
      <div className="animate-pulse-glow border-2 border-brand-500 rounded-lg px-8 py-6 mb-4 bg-brand-500/5">
        <div className="flex gap-3 items-center justify-center">
          {digits.map((d, i) => (
            <span
              key={i}
              className="font-mono font-bold tabular-nums text-brand-400"
              style={{
                fontSize:        'clamp(56px, 10vw, 96px)',
                lineHeight:      1,
                letterSpacing:   0,
              }}
            >
              {d}
            </span>
          ))}
        </div>
      </div>

      {/* Indicador offline */}
      {invoice._offline && (
        <div className="bg-yellow-500/15 border border-yellow-500/30 rounded-lg px-3 py-2 mb-3 max-w-xs">
          <p className="text-yellow-400 text-xs font-medium inline-flex items-center gap-1.5">
            <WifiOff className="w-3.5 h-3.5" /> Factura sin conexión
          </p>
          <p className="text-yellow-300 text-2xs">Se envía sola cuando vuelva la red; ahí recibe su código definitivo.</p>
        </div>
      )}

      {/* Díselo al cliente */}
      <p className="text-gray-400 text-xs mb-5 max-w-xs">
        {invoice._offline
          ? 'Anota este código temporal. El definitivo se asigna al sincronizar.'
          : 'Dile este código al cliente para que pague en la caja.'
        }
      </p>

      {/* Total */}
      <div className="flex items-baseline gap-2 mb-2">
        <span className="text-gray-400 text-sm">Total a cobrar</span>
        <span className="font-mono font-bold tabular-nums text-2xl text-white">{formatCOP(invoice.total)}</span>
      </div>

      {/* Meta */}
      <div className="flex flex-col items-center gap-1 text-xs text-gray-400 mb-6">
        <span>{invoice.location_name}</span>
        {invoice.seller_name && <span>Vendedor: {invoice.seller_name}</span>}
      </div>

      {/* Botón nueva venta */}
      <button
        ref={newSaleRef}
        type="button"
        onClick={onNewSale}
        aria-keyshortcuts={shortcuts ? 'Enter Escape' : undefined}
        className="btn btn-primary btn-lg"
      >
        <Plus className="w-4 h-4" /> Nueva venta
        {shortcuts && <Kbd className="kbd-on-fill">Enter</Kbd>}
      </button>
    </div>
  )
}
