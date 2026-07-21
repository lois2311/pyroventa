-- =====================================================
-- PyroVenta — Migración: cierre de caja, devoluciones,
-- descuentos y bloqueo de intentos de login.
-- Ejecutar en el SQL Editor del dashboard de Supabase.
-- NO destructivo.
-- =====================================================

-- ---- 1. CIERRES DE CAJA (arqueo) --------------------
CREATE TABLE IF NOT EXISTS register_closures (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  location_id       UUID NOT NULL REFERENCES locations(id),
  register_id       UUID REFERENCES registers(id),
  register_name     TEXT,
  cashier_id        UUID REFERENCES sellers(id),
  cashier_name      TEXT,
  business_date     DATE NOT NULL,                       -- día Bogotá que se cierra
  expected_cash     NUMERIC(12,2) NOT NULL DEFAULT 0,    -- según facturas pagadas
  expected_transfer NUMERIC(12,2) NOT NULL DEFAULT 0,
  expected_card     NUMERIC(12,2) NOT NULL DEFAULT 0,
  declared_cash     NUMERIC(12,2) NOT NULL DEFAULT 0,    -- efectivo contado por la cajera
  difference        NUMERIC(12,2) NOT NULL DEFAULT 0,    -- declarado - esperado
  invoice_count     INTEGER NOT NULL DEFAULT 0,
  notes             TEXT,
  closed_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_closures_tenant_date ON register_closures(tenant_id, business_date);
-- Un cierre por caja por día
CREATE UNIQUE INDEX IF NOT EXISTS closures_register_day
  ON register_closures(register_id, business_date) WHERE register_id IS NOT NULL;
ALTER TABLE register_closures ENABLE ROW LEVEL SECURITY;

-- ---- 2. DEVOLUCIONES --------------------------------
ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_status_check;
ALTER TABLE invoices ADD CONSTRAINT invoices_status_check
  CHECK (status IN ('pending', 'paid', 'cancelled', 'refunded'));
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS refunded_at   TIMESTAMPTZ;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS refund_reason TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS refunded_by   UUID REFERENCES sellers(id);

-- ---- 3. DESCUENTOS ----------------------------------
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS discount NUMERIC(12,2) NOT NULL DEFAULT 0;

-- ---- 4. BLOQUEO DE INTENTOS DE LOGIN ----------------
CREATE TABLE IF NOT EXISTS login_attempts (
  key          TEXT PRIMARY KEY,          -- ej: pin:<tenant_id>:<ip> | super:<email>:<ip>
  attempts     INTEGER NOT NULL DEFAULT 0,
  window_start TIMESTAMPTZ NOT NULL DEFAULT now(),
  locked_until TIMESTAMPTZ
);
ALTER TABLE login_attempts ENABLE ROW LEVEL SECURITY;
