import { describe, it, expect } from 'vitest'
import { parseSupportBody, parseSupportFilters, SUPPORT_CATEGORIES } from '../routes/supportRoutes.js'

describe('supportRoutes parser & validation', () => {
  it('expone las 5 categorías oficiales más otra', () => {
    expect(SUPPORT_CATEGORIES).toEqual(['printer', 'payment', 'inventory', 'auth', 'system', 'other'])
  })

  it('valida campos obligatorios para creación de ticket', () => {
    const invalid = parseSupportBody({})
    expect(invalid.error).toBeDefined()

    const missingPhone = parseSupportBody({
      tenant_id: '123e4567-e89b-12d3-a456-426614174000',
      tenant_name: 'Pirotecnia Demo',
      reported_by_name: 'Cajero 1',
      category: 'printer',
    })
    expect(missingPhone.error).toMatch(/teléfono|contacto/i)

    const valid = parseSupportBody({
      tenant_id: '123e4567-e89b-12d3-a456-426614174000',
      tenant_name: 'Pirotecnia Demo',
      reported_by_name: 'Cajero 1',
      contact_phone: '+57 300 123 4567',
      category: 'printer',
      subcategory: 'qz_offline',
      description: 'QZ Tray no conecta en el puerto 8182',
    })
    expect(valid.error).toBeNull()
    expect(valid.data.priority).toBe('medium')
    expect(valid.data.status).toBe('open')
    expect(valid.data.contact_phone).toBe('3001234567')
  })

  it('valida prioridad y categoría válidas', () => {
    const invalidCat = parseSupportBody({
      tenant_id: '123e4567-e89b-12d3-a456-426614174000',
      tenant_name: 'Pirotecnia Demo',
      reported_by_name: 'Cajero 1',
      contact_phone: '3001234567',
      category: 'categoria_inexistente',
    })
    expect(invalidCat.error).toMatch(/categoría/i)

    const validPriority = parseSupportBody({
      tenant_id: '123e4567-e89b-12d3-a456-426614174000',
      tenant_name: 'Pirotecnia Demo',
      reported_by_name: 'Cajero 1',
      contact_phone: '3001234567',
      category: 'system',
      priority: 'critical',
    })
    expect(validPriority.data.priority).toBe('critical')
  })

  it('parseSupportFilters formatea filtros para consulta de superadmin', () => {
    const filters = parseSupportFilters({
      status: 'open',
      priority: 'high',
      tenant_id: 'tenant-123',
    })
    expect(filters.status).toBe('open')
    expect(filters.priority).toBe('high')
    expect(filters.tenant_id).toBe('tenant-123')
  })
})
