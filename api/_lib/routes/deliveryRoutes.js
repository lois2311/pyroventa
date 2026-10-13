import { stub } from './ordersRoutes.js'

// Vendra Pedidos — entregas (PR 7).
export const deliveryCreate = stub('manage_deliveries')  // POST /orders/requests/:id/deliveries
// El driver solo podrá cambiar entregas propias; se valida al implementar.
export const deliveryStatus = stub('update_delivery')    // POST /orders/deliveries/:id/status
