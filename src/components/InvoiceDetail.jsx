import { formatCOP, formatDate } from '../lib/format.js'

export default function InvoiceDetail({ invoice }) {
  if (!invoice) return null

  const items = Array.isArray(invoice.items) ? invoice.items : []

  return (
    <div className="animate-fade-in space-y-4">
      {/* Cabecera */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wider">Factura</p>
          <span className="font-mono font-bold text-4xl text-brand-400 tracking-widest">
            #{invoice.code}
          </span>
        </div>
        <span className="badge-pending">Pendiente</span>
      </div>

      {/* Meta */}
      <div className="grid grid-cols-2 gap-2 text-xs text-gray-500">
        <div>
          <span className="block text-gray-400">Vendedor</span>
          <span className="text-gray-300">{invoice.seller_name || '—'}</span>
        </div>
        <div>
          <span className="block text-gray-400">Hora</span>
          <span className="text-gray-300">{formatDate(invoice.created_at)}</span>
        </div>
      </div>

      {/* Items */}
      <div className="border border-white/5 rounded-xl overflow-hidden">
        <div className="flex text-xs text-gray-400 px-3 py-2 border-b border-white/5 bg-surface-400">
          <span className="flex-1">Producto</span>
          <span className="w-10 text-center">Cant</span>
          <span className="w-20 text-right">Valor</span>
        </div>
        {items.map((item, idx) => (
          <div key={idx} className="flex items-center px-3 py-2.5 border-b border-white/5 last:border-0">
            <div className="flex-1 min-w-0">
              <p className="text-sm text-white truncate">
                {item.product_name || item.productName}
              </p>
              <p className="text-xs text-gray-400">{item.label}</p>
            </div>
            <span className="w-10 text-center text-sm text-gray-400">×{item.qty}</span>
            <span className="w-20 text-right text-sm font-mono font-semibold text-brand-400">
              {formatCOP(item.subtotal)}
            </span>
          </div>
        ))}
      </div>

      {/* Total */}
      <div className="flex items-center justify-between border-t border-white/5 pt-3">
        <span className="text-gray-400">Total</span>
        <span className="font-syne font-bold text-2xl text-white">{formatCOP(invoice.total)}</span>
      </div>
    </div>
  )
}
