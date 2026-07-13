import { describe, it, expect } from 'vitest'
import { getTenantStatus } from '../tenantStatus.js'

const base = { active: true, license_start: '2026-01-01', license_end: '2026-12-31' }
const dia = (s) => new Date(`${s}T12:00:00Z`)

describe('getTenantStatus', () => {
  it('tenant null → TENANT_NOT_FOUND', () => {
    expect(getTenantStatus(null).code).toBe('TENANT_NOT_FOUND')
  })
  it('tenant inactivo → TENANT_SUSPENDED', () => {
    expect(getTenantStatus({ ...base, active: false }, dia('2026-06-15')).code).toBe('TENANT_SUSPENDED')
  })
  it('antes de license_start → LICENSE_NOT_STARTED', () => {
    expect(getTenantStatus(base, dia('2025-12-31')).code).toBe('LICENSE_NOT_STARTED')
  })
  it('después de license_end → LICENSE_EXPIRED', () => {
    expect(getTenantStatus(base, dia('2027-01-01')).code).toBe('LICENSE_EXPIRED')
  })
  it('license_end es inclusivo', () => {
    expect(getTenantStatus(base, dia('2026-12-31')).ok).toBe(true)
  })
  it('vigente → ok', () => {
    expect(getTenantStatus(base, dia('2026-06-15')).ok).toBe(true)
  })
})
