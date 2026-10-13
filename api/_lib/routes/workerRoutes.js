import { createHash, timingSafeEqual } from 'node:crypto'
import { processBatch } from '../services/outboxService.js'
import { handlers } from '../events/handlers.js'
import { purgeExpired } from '../events/retention.js'

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
  // Retención: una vez por hora (los primeros 5 min), aunque el planificador llame cada minuto; no debe tumbar el worker
  let purged
  if (new Date().getUTCMinutes() < 5) purged = await purgeExpired().catch(() => null)
  // Solo conteos: nunca payloads, teléfonos ni tokens en logs
  console.info(JSON.stringify({ event: 'outbox.run', ...summary, ...(purged && { purged }) }))
  return res.json(summary)
}
