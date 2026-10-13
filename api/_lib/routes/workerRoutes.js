import { createHash, timingSafeEqual } from 'node:crypto'
import { processBatch } from '../services/outboxService.js'
import { handlers } from '../events/handlers.js'

// =====================================================
// Disparador del worker del outbox: GET|POST /internal/outbox/run
// Pensado para un planificador administrado (Vercel Cron, pg_cron + pg_net, GitHub Actions…):
// la función serverless no es un worker persistente, así que algo externo la invoca a
// intervalos. Se autentica con `Authorization: Bearer $CRON_SECRET` (Vercel Cron lo envía solo).
// Sin CRON_SECRET configurado el endpoint queda deshabilitado.
// =====================================================

const digest = (s) => createHash('sha256').update(String(s)).digest()

export async function outboxRun(req, res) {
  const secret = process.env.CRON_SECRET
  if (!secret) return res.status(503).json({ error: 'Worker no configurado' })
  const given = String(req.headers?.authorization || '').replace(/^Bearer\s+/i, '').trim()
  if (!given || !timingSafeEqual(digest(given), digest(secret))) return res.status(401).json({ error: 'No autorizado' })

  const summary = await processBatch({ handlers })
  // Solo conteos: nunca payloads, teléfonos ni tokens en logs
  console.info(JSON.stringify({ event: 'outbox.run', ...summary }))
  return res.json(summary)
}
