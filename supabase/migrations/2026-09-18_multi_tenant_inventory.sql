-- =====================================================
-- PyroVenta — Control de Inventario Multi-Empresa
--
-- 1. tenants.has_inventory: Flag por empresa para activar/desactivar inventario
-- 2. stock: Existencias de productos por punto de venta
-- 3. stock_movements: Bitácora de trazabilidad de entradas y salidas de inventario
-- =====================================================

-- 1. AGREGAR FLAG DE INVENTARIO A TENANTS
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS has_inventory BOOLEAN NOT NULL DEFAULT false;

-- 2. TABLA DE STOCK (POR PRODUCTO Y PUNTO DE VENTA)
CREATE TABLE IF NOT EXISTS stock (
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  product_id  UUID NOT NULL REFERENCES products(id)   ON DELETE CASCADE,
  location_id UUID NOT NULL REFERENCES locations(id)  ON DELETE CASCADE,
  quantity    INTEGER NOT NULL DEFAULT 0,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (product_id, location_id)
);

-- stock ya existía sin updated_at en algunos entornos (creada manualmente
-- antes de esta migración); CREATE TABLE IF NOT EXISTS no la altera.
ALTER TABLE stock ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_stock_tenant_loc ON stock(tenant_id, location_id);
CREATE INDEX IF NOT EXISTS idx_stock_product    ON stock(product_id);

-- 3. TABLA DE TRAZABILIDAD / AUDITORÍA DE MOVIMIENTOS DE STOCK
CREATE TABLE IF NOT EXISTS stock_movements (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  location_id UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  product_id  UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  delta       INTEGER NOT NULL,                     -- Diferencia (+/-)
  final_stock INTEGER NOT NULL,                     -- Stock resultante
  reason      TEXT NOT NULL
              CHECK (reason IN ('sale', 'refund', 'manual_adjustment', 'initial_load', 'bulk_upload')),
  invoice_id  UUID REFERENCES invoices(id) ON DELETE SET NULL,
  user_id     UUID REFERENCES sellers(id) ON DELETE SET NULL,
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stock_movements_tenant_loc ON stock_movements(tenant_id, location_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_movements_prod       ON stock_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_invoice    ON stock_movements(invoice_id);

-- 4. ROW LEVEL SECURITY
ALTER TABLE stock           ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;
