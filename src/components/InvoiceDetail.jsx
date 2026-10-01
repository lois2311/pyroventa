import { formatCOP, formatDate } from '../lib/format.js'
import ProductImage from './ProductImage.jsx'

export default function InvoiceDetail({ invoice, productImages = {} }) {
  if (!invoice) return null

  const items = Array.isArray(invoice.items) ? invoice.items : []

  return (
    <div className="animate-fade-in space-y-4">
      {/* Cabecera */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-gray-400 uppercase tracking-wider">Factura</p>
          <span className="font-mono font-bold tabular-nums text-4xl text-white tracking-widest">
            #{invoice.code}
          </span>
        </div>
        <span className="badge-pending">Pendiente</span>
      </div>

      {/* Meta */}
      <div className="grid grid-cols-2 gap-2 text-xs text-gray-400">
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
      <div className="border border-white/5 rounded-lg overflow-hidden">
        <div className="flex text-xs text-gray-400 px-3 py-2 border-b border-white/5 bg-surface-400">
          <span className="flex-1">Producto</span>
          <span className="w-12 text-right">Cant</span>
          <span className="w-24 text-right">Valor</span>
        </div>
        {items.map((item, idx) => (
          <div key={idx} className="flex items-center gap-2.5 px-3 py-2.5 border-b border-white/5 last:border-0">
            <ProductImage
              src={productImages[item.productId]}
              name={item.product_name || item.productName}
              className="w-9 h-9"
            />
            <div className="flex-1 min-w-0">
              <p className="text-sm text-white truncate">
                {item.product_name || item.productName}
              </p>
              <div className="flex items-center gap-1.5 flex-wrap">
                <p className="text-xs text-gray-400">{item.label} · <span className="font-mono tabular-nums">{formatCOP(item.price)}</span></p>
                {item.is_price_edited && (
                  <span className="text-2xs bg-amber-500/20 text-amber-300 font-medium px-1.5 py-px rounded border border-amber-500/30">
                    Editado (Base: {formatCOP(item.original_price)})
                  </span>
                )}
              </div>
              {item.is_price_edited && item.price_edit_reason && (
                <p className="text-2xs text-gray-400 italic truncate mt-0.5">
                  Motivo: {item.price_edit_reason}
                </p>
              )}
            </div>
            <span className="w-12 text-right font-mono tabular-nums text-sm text-gray-300">×{item.qty}</span>
            <span className="w-24 text-right text-sm font-mono tabular-nums font-semibold text-white">
              {formatCOP(item.subtotal)}
            </span>
          </div>
        ))}
      </div>

      {/* Total */}
      <div className="flex items-center justify-between border-t border-white/5 pt-3">
        <span className="text-gray-400">Total</span>
        <span className="font-mono font-bold tabular-nums text-3xl text-white">{formatCOP(invoice.total)}</span>
      </div>
    </div>
  )
}
