-- =====================================================
-- PyroVenta / VENDRA POS — Módulo de Soporte y Mesa de Ayuda
-- Migración no destructiva: support_tickets
-- =====================================================

CREATE SEQUENCE IF NOT EXISTS support_ticket_seq START WITH 1001;

CREATE TABLE IF NOT EXISTS support_tickets (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_code       TEXT NOT NULL UNIQUE,
  tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  tenant_name       TEXT NOT NULL,
  location_id       UUID REFERENCES locations(id) ON DELETE SET NULL,
  location_name     TEXT,
  register_id       UUID REFERENCES registers(id) ON DELETE SET NULL,
  register_name     TEXT,
  reported_by_id    UUID REFERENCES sellers(id) ON DELETE SET NULL,
  reported_by_name  TEXT NOT NULL,
  reported_by_role  TEXT,
  contact_phone     TEXT NOT NULL,
  category          TEXT NOT NULL CHECK (category IN ('printer', 'payment', 'inventory', 'auth', 'system', 'other')),
  subcategory       TEXT,
  description       TEXT,
  priority          TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  status            TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
  technical_context JSONB NOT NULL DEFAULT '{}',
  assigned_to       TEXT,
  resolution_notes  TEXT,
  resolved_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION generate_ticket_code()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.ticket_code IS NULL OR NEW.ticket_code = '' THEN
    NEW.ticket_code := 'VND-' || nextval('support_ticket_seq')::TEXT;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_support_ticket_code ON support_tickets;
CREATE TRIGGER trg_support_ticket_code
BEFORE INSERT ON support_tickets
FOR EACH ROW
EXECUTE FUNCTION generate_ticket_code();

CREATE INDEX IF NOT EXISTS idx_support_tickets_tenant ON support_tickets(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON support_tickets(status, priority);
CREATE INDEX IF NOT EXISTS idx_support_tickets_created ON support_tickets(created_at DESC);

ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;
