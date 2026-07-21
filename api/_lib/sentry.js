// =====================================================
// PyroVenta — Monitoreo de errores (opcional)
// Se activa solo si SENTRY_DSN está configurado; sin la
// variable no se carga el SDK ni agrega latencia.
// =====================================================
let sdk = null

async function getSdk() {
  if (!process.env.SENTRY_DSN) return null
  if (!sdk) {
    const Sentry = await import('@sentry/node')
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.VERCEL_ENV || 'development',
      tracesSampleRate: 0,
    })
    sdk = Sentry
  }
  return sdk
}

/** Reporta una excepción no controlada (best effort, nunca lanza). */
export async function reportError(err, context = {}) {
  try {
    const Sentry = await getSdk()
    if (!Sentry) return
    Sentry.captureException(err, { extra: context })
    await Sentry.flush(1500) // serverless: asegurar el envío antes de terminar
  } catch { /* el monitoreo nunca debe tumbar la request */ }
}
