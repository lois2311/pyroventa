import { Monitor } from 'lucide-react'
import ReportDetailModal from './ReportDetailModal.jsx'

export default function RegisterDetailModal({ registerId, registerName, from, to, locationId, onClose }) {
  return (
    <ReportDetailModal
      title={registerName}
      subtitle="Detalle de caja"
      icon={Monitor}
      endpoint="/reports/register-detail"
      params={{ register_id: registerId, location_id: locationId }}
      from={from}
      to={to}
      onClose={onClose}
      exportName="caja"
      exportSheetKey="Caja"
      invoiceSeller={inv => inv.seller_name}
      invoiceMeta={inv => inv.seller_name && `Vendió: ${inv.seller_name}`}
    />
  )
}
