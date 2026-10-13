import { whatsappWebhookVerify, whatsappWebhookPost } from '../../../_lib/routes/whatsappRoutes.js'

// =====================================================
// Función aparte para el webhook de WhatsApp (ruta /api/integrations/whatsapp/:provider/webhook).
// La firma X-Hub-Signature-256 se calcula sobre los bytes exactos del cuerpo: aquí el parser
// de Vercel está apagado y se lee el cuerpo crudo. El despachador general (api/[[...path]].js)
// sigue parseando JSON para el resto de la API y no se toca.
// vercel.json enruta esta ruta directamente a este archivo.
// =====================================================

export const config = { api: { bodyParser: false } }

const MAX_BODY = 1024 * 1024 // los webhooks de Meta son pequeños

async function readRaw(req) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > MAX_BODY) throw Object.assign(new Error('Cuerpo demasiado grande'), { status: 413 })
    chunks.push(chunk)
  }
  return Buffer.concat(chunks).toString('utf8')
}

export default async function handler(req, res) {
  try {
    const url = new URL(req.url || '', 'http://localhost')
    const provider = url.pathname.split('/')[4] // /api/integrations/whatsapp/:provider/webhook
    req.query = { ...Object.fromEntries(url.searchParams), ...req.query }
    if (req.method === 'GET') return await whatsappWebhookVerify(req, res, provider)
    if (req.method === 'POST') {
      req.rawBody = await readRaw(req)
      return await whatsappWebhookPost(req, res, provider)
    }
    return res.status(405).json({ error: 'Método no permitido' })
  } catch (err) {
    if (err.status === 413) return res.status(413).json({ error: err.message })
    const { reportError } = await import('../../../_lib/sentry.js')
    await reportError(err, { url: req.url, method: req.method })
    if (!res.headersSent) res.status(500).json({ error: 'Error interno del servidor' })
  }
}
