import { describe, it, expect, beforeEach } from 'vitest'

// El entorno de pruebas es 'node' (sin jsdom): offlineQueue usa localStorage
// del navegador, así que se stubea un almacén en memoria equivalente.
function createLocalStorageStub() {
  let store = {}
  return {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v) },
    removeItem: (k) => { delete store[k] },
    clear: () => { store = {} },
  }
}
globalThis.localStorage = createLocalStorageStub()

const { enqueue, getPending, getAll, syncAll } = await import('../offlineQueue.js')

beforeEach(() => localStorage.clear())

const err = (status, message) => Object.assign(new Error(message), { status })

describe('syncAll', () => {
  it('un 401 durante el reintento deja la operación pending, no failed', async () => {
    enqueue({ type: 'create_invoice', payload: { a: 1 } })
    const results = await syncAll(async () => { throw err(401, 'Token inválido o expirado') })

    expect(results).toMatchObject({ synced: 0, failed: 0, pending: 1 })
    expect(getPending()).toHaveLength(1)
    expect(getAll()[0].status).toBe('pending')
  })

  it('un 403 permanente se marca failed y se reporta en permanentFailures', async () => {
    enqueue({ type: 'pay_invoice', payload: { code: 'T100', body: {} } })
    const results = await syncAll(async () => { throw err(403, 'No tienes permiso para esta acción') })

    expect(results.failed).toBe(1)
    expect(results.permanentFailures).toHaveLength(1)
    expect(results.permanentFailures[0].status).toBe(403)
    expect(getAll()[0].status).toBe('failed')
  })

  it('un error transitorio (500) se marca failed pero no se reporta como permanente', async () => {
    enqueue({ type: 'create_invoice', payload: {} })
    const results = await syncAll(async () => { throw err(500, 'Error interno') })

    expect(results.failed).toBe(1)
    expect(results.permanentFailures).toHaveLength(0)
  })

  it('éxito marca synced', async () => {
    enqueue({ type: 'create_invoice', payload: {} })
    const results = await syncAll(async () => ({ code: 'F001' }))

    expect(results.synced).toBe(1)
    expect(getPending()).toHaveLength(0)
  })
})
