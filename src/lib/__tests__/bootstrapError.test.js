import { describe, it, expect } from 'vitest'
import { classifyBootstrapError } from '../bootstrapError.js'

describe('classifyBootstrapError', () => {
  it('404/403 → soltar el amarre con el mensaje del servidor', () => {
    const e = Object.assign(new Error('Empresa no encontrada'), { status: 404 })
    expect(classifyBootstrapError(e)).toEqual({ clearSlug: true, message: 'Empresa no encontrada' })
    const e2 = Object.assign(new Error('Licencia vencida'), { status: 403 })
    expect(classifyBootstrapError(e2).clearSlug).toBe(true)
  })
  it('5xx → conservar slug con mensaje de servidor', () => {
    const e = Object.assign(new Error('Error interno'), { status: 500 })
    expect(classifyBootstrapError(e)).toEqual({ clearSlug: false, message: 'Error del servidor — reintenta en un momento' })
  })
  it('sin status (red) → conservar slug con el mensaje del error', () => {
    const e = new Error('Sin conexión a internet')
    expect(classifyBootstrapError(e)).toEqual({ clearSlug: false, message: 'Sin conexión a internet' })
  })
})
