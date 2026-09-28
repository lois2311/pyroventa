import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// api.js lee el token de localStorage y avisa licencias por window: en Node
// se simulan lo justo para ejercitar la lógica de reintentos y cancelación.
beforeEach(() => {
  globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} }
  globalThis.window = { dispatchEvent: () => {}, location: { href: '' } }
  globalThis.CustomEvent = class { constructor(type, init) { this.type = type; this.detail = init?.detail } }
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

const jsonResponse = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
})

async function loadApi() {
  vi.resetModules()
  return (await import('../api.js')).api
}

describe('api — reintentos', () => {
  it('no reintenta errores 4xx: un PIN equivocado es un solo intento', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(401, { error: 'PIN incorrecto' }))
    globalThis.fetch = fetchMock
    const api = await loadApi()

    await expect(api.post('/auth/login', { pin: '0000' })).rejects.toMatchObject({ status: 401, message: 'PIN incorrecto' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('no reintenta un 404 (p. ej. factura inexistente)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(404, { error: 'No existe' }))
    globalThis.fetch = fetchMock
    const api = await loadApi()

    await expect(api.get('/invoices/9999')).rejects.toMatchObject({ status: 404 })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('reintenta errores 5xx y devuelve la respuesta cuando se recupera', async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(503, { error: 'Caído' }))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }))
    globalThis.fetch = fetchMock
    const api = await loadApi()

    const pending = api.get('/reports/daily')
    await vi.advanceTimersByTimeAsync(2000)
    await expect(pending).resolves.toEqual({ ok: true })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('reintenta 429 (demasiadas solicitudes)', async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(429, { error: 'Espera' }))
      .mockResolvedValueOnce(jsonResponse(200, [1]))
    globalThis.fetch = fetchMock
    const api = await loadApi()

    const pending = api.get('/products')
    await vi.advanceTimersByTimeAsync(2000)
    await expect(pending).resolves.toEqual([1])
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})

describe('api — cancelación', () => {
  it('un signal ya abortado no llega a pedir', async () => {
    const fetchMock = vi.fn()
    globalThis.fetch = fetchMock
    const api = await loadApi()
    const controller = new AbortController()
    controller.abort()

    await expect(api.get('/reports/daily', { signal: controller.signal })).rejects.toMatchObject({ canceled: true })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('cancelar durante la espera entre reintentos corta sin volver a pedir', async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(500, { error: 'x' }))
    globalThis.fetch = fetchMock
    const api = await loadApi()
    const controller = new AbortController()

    const pending = api.get('/reports/daily', { signal: controller.signal })
    const assertion = expect(pending).rejects.toMatchObject({ canceled: true })
    await vi.advanceTimersByTimeAsync(10)
    controller.abort()
    await assertion
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
