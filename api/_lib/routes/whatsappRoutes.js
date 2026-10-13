import { stub, publicStub } from './ordersRoutes.js'

// Vendra Pedidos — WhatsApp (PR 6). Sin SDK de proveedor: el adaptador llega tras decidir Meta vs Twilio.

// Webhook del proveedor: sin JWT; la autenticidad se valida por firma al implementarlo.
export const whatsappWebhookVerify = publicStub  // GET  /integrations/whatsapp/:provider/webhook
export const whatsappWebhookPost   = publicStub  // POST /integrations/whatsapp/:provider/webhook

export const conversationsList = stub('manage_conversations')  // GET  /orders/conversations
export const messageSend       = stub('manage_conversations')  // POST /orders/conversations/:id/messages
