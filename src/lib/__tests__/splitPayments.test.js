import { describe, expect, it } from 'vitest'
import { evaluateSplit, splitPayBody } from '../splitPayments.js'

describe('evaluateSplit', () => {
  it('efectivo + datáfono que suman el total', () => {
    const s = evaluateSplit(182000, { cash: '50000', card: '132000' })
    expect(s).toMatchObject({ ok: true, remaining: 0, change: 0, error: null })
    expect(s.payments).toEqual([
      { method: 'cash', amount: 50000 },
      { method: 'card', amount: 132000 },
    ])
  })

  it('falta plata: no se puede cobrar', () => {
    const s = evaluateSplit(100000, { cash: '40000' })
    expect(s).toMatchObject({ ok: false, remaining: 60000, error: 'short' })
  })

  it('el vuelto sale del efectivo y los montos netos suman el total', () => {
    const s = evaluateSplit(100000, { cash: '70000', card: '50000' })
    expect(s.change).toBe(20000)
    expect(s.payments.reduce((t, p) => t + p.amount, 0)).toBe(100000)
    expect(s.payments[0]).toEqual({ method: 'cash', amount: 50000 })
  })

  it('un sobrante que el efectivo no puede devolver es inválido', () => {
    const s = evaluateSplit(100000, { cash: '10000', card: '120000' })
    expect(s).toMatchObject({ ok: false, error: 'overpaid' })
  })

  it('la transferencia exige proveedor', () => {
    expect(evaluateSplit(100, { transfer: '100' }).error).toBe('provider')
    expect(evaluateSplit(100, { transfer: '100' }, 'nequi').ok).toBe(true)
  })

  it('ignora negativos y texto', () => {
    expect(evaluateSplit(100, { cash: '-5', card: 'abc' })).toMatchObject({ ok: false, paid: 0 })
  })
})

describe('splitPayBody', () => {
  it('pay_method es el método de mayor monto; el proveedor va dentro del pago', () => {
    const s = evaluateSplit(100000, { cash: '30000', transfer: '70000' }, 'nequi')
    const body = splitPayBody(s)
    expect(body.pay_method).toBe('transfer')
    expect(body.transfer_provider).toBe('nequi')
    expect(body.payments).toHaveLength(2)
  })

  it('sin transferencia principal no manda transfer_provider en la raíz', () => {
    const s = evaluateSplit(100000, { cash: '70000', transfer: '30000' }, 'nequi')
    const body = splitPayBody(s)
    expect(body.pay_method).toBe('cash')
    expect(body).not.toHaveProperty('transfer_provider')
  })
})
