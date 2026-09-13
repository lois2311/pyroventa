-- =====================================================
-- PyroVenta — Precios Diferenciales por Punto y Auditoría de Precios
--
-- 1. location_prices: Precios específicos de presentaciones por punto de venta
-- 2. location_products: Control de productos habilitados/deshabilitados por punto
-- 3. price_audit_logs: Registro de auditoría de modificaciones de precios
-- =====================================================

CREATE TABLE IF NOT EXISTS location_prices (
  location_id     UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  presentation_id UUID NOT NULL REFERENCES presentations(id) ON DELETE CASCADE,
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  price           NUMERIC(12,2) NOT NULL CHECK (price >= 0),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (location_id, presentation_id)
);

CREATE INDEX IF NOT EXISTS idx_location_prices_tenant ON location_prices(tenant_id);
CREATE INDEX IF NOT EXISTS idx_location_prices_loc    ON location_prices(location_id);

CREATE TABLE IF NOT EXISTS location_products (
  location_id UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  product_id  UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  active      BOOLEAN NOT NULL DEFAULT true,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (location_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_location_products_tenant ON location_products(tenant_id);
CREATE INDEX IF NOT EXISTS idx_location_products_loc    ON location_products(location_id);

CREATE TABLE IF NOT EXISTS price_audit_logs (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  location_id        UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  location_name      TEXT,
  invoice_id         UUID REFERENCES invoices(id) ON DELETE SET NULL,
  invoice_code       CHAR(4),
  user_id            UUID REFERENCES sellers(id) ON DELETE SET NULL,
  user_name          TEXT NOT NULL,
  user_role          TEXT NOT NULL,
  presentation_id    UUID REFERENCES presentations(id) ON DELETE SET NULL,
  product_id         UUID REFERENCES products(id) ON DELETE SET NULL,
  product_name       TEXT NOT NULL,
  presentation_label TEXT NOT NULL,
  original_price     NUMERIC(12,2) NOT NULL,
  edited_price       NUMERIC(12,2) NOT NULL,
  difference         NUMERIC(12,2) NOT NULL,
  qty                INTEGER NOT NULL DEFAULT 1,
  total_difference   NUMERIC(12,2) NOT NULL,
  reason             TEXT,
  stage              TEXT NOT NULL CHECK (stage IN ('cart_creation', 'invoice_edit')),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_price_audit_tenant_date ON price_audit_logs(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_price_audit_tenant_loc  ON price_audit_logs(tenant_id, location_id);
CREATE INDEX IF NOT EXISTS idx_price_audit_tenant_user ON price_audit_logs(tenant_id, user_id);

ALTER TABLE location_prices   ENABLE ROW LEVEL SECURITY;
ALTER TABLE location_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_audit_logs  ENABLE ROW LEVEL SECURITY;
