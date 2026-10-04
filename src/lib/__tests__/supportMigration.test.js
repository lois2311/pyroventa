import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

describe('Migración support_tickets', () => {
  it('contiene la definición de tabla con columnas requeridas y RLS', () => {
    const migrationPath = path.resolve(__dirname, '../../../supabase/migrations/2026-10-03_support_tickets.sql')
    expect(fs.existsSync(migrationPath)).toBe(true)
    const sql = fs.readFileSync(migrationPath, 'utf8')
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS support_tickets')
    expect(sql).toContain('ticket_code')
    expect(sql).toContain('tenant_id')
    expect(sql).toContain('technical_context')
    expect(sql).toContain('ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY')
    expect(sql).toContain('support_ticket_seq')
    expect(sql).toContain('generate_ticket_code')
  })
})
