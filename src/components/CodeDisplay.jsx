import { formatCOP } from '../lib/format.js'

export default function CodeDisplay({ invoice, onNewSale }) {
  if (!invoice) return null

  const digits = String(invoice.code).split('')

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 text-center animate-fade-in">

      {/* Etiqueta */}
      <p className="text-gray-500 text-sm font-medium uppercase tracking-widest mb-3">
        Código de factura
      </p>

      {/* Código — la pieza central */}
      <div className="animate-pulse-glow border-2 border-brand-500 rounded-2xl px-8 py-6 mb-4 bg-brand-500/5">
        <div className="flex gap-3 items-center justify-center">
          {digits.map((d, i) => (
            <span
              key={i}
              className="font-mono font-bold text-brand-400 animate-scale-in"
              style={{
                fontSize:        'clamp(56px, 10vw, 96px)',
                lineHeight:      1,
                animationDelay:  `${i * 60}ms`,
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
          <p className="text-yellow-400 text-xs font-medium">📡 Factura offline</p>
          <p className="text-yellow-500/70 text-[10px]">Se sincronizará cuando vuelva la conexión. El código real se asignará en ese momento.</p>
        </div>
      )}

      {/* Díselo al cliente */}
      <p className="text-gray-400 text-xs mb-5 max-w-xs">
        {invoice._offline
          ? 'Anote este código temporal. El código definitivo se asigna al sincronizar.'
          : 'Dígale este código al cliente para que vaya a la caja a pagar'
        }
      </p>

      {/* Total */}
      <div className="flex items-center gap-2 mb-2">
        <span className="text-gray-500 text-sm">Total a cobrar:</span>
        <span className="font-syne font-bold text-2xl text-white">{formatCOP(invoice.total)}</span>
      </div>

      {/* Meta */}
      <div className="flex flex-col items-center gap-1 text-xs text-gray-600 mb-6">
        <span>{invoice.location_name}</span>
        {invoice.seller_name && <span>Vendedor: {invoice.seller_name}</span>}
      </div>

      {/* Botón nueva venta */}
      <button onClick={onNewSale} className="btn btn-primary btn-lg">
        ＋ Nueva venta
      </button>
    </div>
  )
}
