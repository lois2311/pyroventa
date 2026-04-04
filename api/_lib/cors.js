/**
 * Aplica headers CORS a la respuesta.
 * Llamar al inicio de cada serverless function.
 * @returns {boolean} true si es un preflight OPTIONS (la función debe retornar inmediatamente)
 */
export function handleCors(req, res) {
  res.setHeader('Access-Control-Allow-Origin',  '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') {
    res.status(200).end()
    return true
  }
  return false
}
