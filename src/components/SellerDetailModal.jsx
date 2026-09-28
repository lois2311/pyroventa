import { MapPin, UserRound } from 'lucide-react'
import ReportDetailModal from './ReportDetailModal.jsx'

export default function SellerDetailModal({ sellerId, sellerName, from, to, locationId, onClose }) {
  return (
    <ReportDetailModal
      title={sellerName}
      subtitle="Detalle de ventas"
      icon={UserRound}
      endpoint="/reports/seller-detail"
      params={{ seller_id: sellerId, location_id: locationId }}
      from={from}
      to={to}
      onClose={onClose}
      exportName="vendedor"
      exportSheetKey="Vendedor"
      invoiceSeller={() => sellerName}
      invoiceMeta={inv => inv.location_name && <><MapPin className="h-2.5 w-2.5" aria-hidden="true" /> {inv.location_name}</>}
    />
  )
}
