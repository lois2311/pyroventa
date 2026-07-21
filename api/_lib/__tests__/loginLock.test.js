import { describe, it, expect } from 'vitest'
import { nextAttemptState, lockRemainingMinutes, MAX_ATTEMPTS, WINDOW_MS, LOCK_MS } from '../loginLock.js'

const NOW = 1_700_000_000_000

describe('nextAttemptState', () => {
  it('primer fallo crea ventana nueva con 1 intento, sin bloqueo', () => {
    const s = nextAttemptState(null, NOW)
    expect(s.attempts).toBe(1)
    expect(s.locked_until).toBeNull()
    expect(new Date(s.window_start).getTime()).toBe(NOW)
  })

  it('acumula intentos dentro de la ventana', () => {
    const row = { attempts: 2, window_start: new Date(NOW - 60_000).toISOString(), locked_until: null }
    const s = nextAttemptState(row, NOW)
    expect(s.attempts).toBe(3)
    expect(s.locked_until).toBeNull()
  })

  it(`bloquea al llegar a ${MAX_ATTEMPTS} intentos`, () => {
    const row = { attempts: MAX_ATTEMPTS - 1, window_start: new Date(NOW - 60_000).toISOString(), locked_until: null }
    const s = nextAttemptState(row, NOW)
    expect(s.attempts).toBe(MAX_ATTEMPTS)
    expect(new Date(s.locked_until).getTime()).toBe(NOW + LOCK_MS)
  })

  it('reinicia el contador cuando la ventana expiró', () => {
    const row = { attempts: 4, window_start: new Date(NOW - WINDOW_MS - 1).toISOString(), locked_until: null }
    const s = nextAttemptState(row, NOW)
    expect(s.attempts).toBe(1)
    expect(s.locked_until).toBeNull()
  })
})

describe('lockRemainingMinutes', () => {
  it('retorna 0 sin fila o sin bloqueo', () => {
    expect(lockRemainingMinutes(null, NOW)).toBe(0)
    expect(lockRemainingMinutes({ locked_until: null }, NOW)).toBe(0)
  })

  it('retorna minutos restantes redondeados hacia arriba', () => {
    const row = { locked_until: new Date(NOW + 61_000).toISOString() }
    expect(lockRemainingMinutes(row, NOW)).toBe(2)
  })

  it('retorna 0 cuando el bloqueo ya venció', () => {
    const row = { locked_until: new Date(NOW - 1000).toISOString() }
    expect(lockRemainingMinutes(row, NOW)).toBe(0)
  })
})
