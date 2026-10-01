import { describe, it, expect } from 'vitest'
import { isSafeToReload, IDLE_BEFORE_RELOAD_MS } from '../appUpdate.js'

const calm = { writes: 0, dialogOpen: false, editing: false, hidden: false, idleMs: IDLE_BEFORE_RELOAD_MS }

describe('appUpdate — isSafeToReload', () => {
  it('recarga con el equipo quieto 30 s y nada en curso', () => {
    expect(isSafeToReload(calm)).toBe(true)
  })

  it('recarga de inmediato si la pestaña está oculta', () => {
    expect(isSafeToReload({ ...calm, idleMs: 0, hidden: true })).toBe(true)
  })

  it('no recarga mientras el cajero está activo', () => {
    expect(isSafeToReload({ ...calm, idleMs: IDLE_BEFORE_RELOAD_MS - 1 })).toBe(false)
  })

  it('nunca recarga con un guardado en curso (cobro, factura), ni oculta', () => {
    expect(isSafeToReload({ ...calm, writes: 1 })).toBe(false)
    expect(isSafeToReload({ ...calm, writes: 1, hidden: true })).toBe(false)
  })

  it('nunca recarga con un diálogo abierto o un campo a medio escribir', () => {
    expect(isSafeToReload({ ...calm, dialogOpen: true, hidden: true })).toBe(false)
    expect(isSafeToReload({ ...calm, editing: true, hidden: true })).toBe(false)
  })
})
