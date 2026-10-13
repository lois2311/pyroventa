-- =====================================================
-- VENDRA PEDIDOS — Fase 1, PR-01: fundación (rol driver, columnas en invoices, order_settings, delivery_zones)
--
-- Alcance recortado según docs/PLAN_MAESTRO_VENDRA_PEDIDOS.md (§4 Fase 1: no crear tablas sin necesidad).
-- Solicitudes/pagos -> migración del PR-03; canales/eventos/outbox -> PR-05/06; entregas -> PR-07.
--
-- 100% ADITIVO e idempotente (IF NOT EXISTS). No borra ni reescribe datos.
-- No toca invoicesCreate / invoicesPay / caja / inventario: las columnas nuevas de
-- `invoices` tienen DEFAULT que reproduce el comportamiento POS actual.
-- Todo el acceso pasa por la API con service_role; RLS activa y sin políticas.
--
-- Revisar y ejecutar a mano en el SQL Editor de Supabase ANTES de desplegar el código.
-- =====================================================

-- ---- 1. Rol 'driver' (domiciliario) -----------------
-- Mismas credenciales que seller/cashier (PIN). El login del driver llega en un PR posterior.
ALTER TABLE sellers DROP CONSTRAINT IF EXISTS sellers_role_check;
ALTER TABLE sellers ADD CONSTRAINT sellers_role_check
  CHECK (role IN ('seller', 'cashier', 'admin', 'owner', 'driver'));

ALTER TABLE sellers DROP CONSTRAINT IF EXISTS sellers_credentials_by_role;
ALTER TABLE sellers ADD CONSTRAINT sellers_credentials_by_role CHECK (
  NOT active
  OR (role IN ('admin', 'owner') AND username IS NOT NULL AND password_hash IS NOT NULL)
  OR (role IN ('seller', 'cashier', 'driver') AND pin IS NOT NULL)
);

-- ---- 2. Extensión de invoices (para la futura conversión Pedido → Factura) ----
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS source           TEXT NOT NULL DEFAULT 'pos'
  CHECK (source IN ('pos', 'whatsapp', 'web'));
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS fulfillment_type TEXT NOT NULL DEFAULT 'in_store'
  CHECK (fulfillment_type IN ('in_store', 'pickup', 'delivery'));
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS delivery_status  TEXT NOT NULL DEFAULT 'not_required'
  CHECK (delivery_status IN ('not_required', 'ready_for_dispatch', 'assigned', 'picked_up', 'delivered', 'delivery_failed'));
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS customer_phone   TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS delivery_address TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS delivery_notes   TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS delivery_fee     NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (delivery_fee >= 0);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS driver_id        UUID REFERENCES sellers(id) ON DELETE SET NULL;

-- ---- 3. Configuración comercial por sede ------------
CREATE TABLE IF NOT EXISTS order_settings (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  location_id        UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  enabled            BOOLEAN NOT NULL DEFAULT false,
  public_slug        TEXT,                                   -- formulario público; único global
  currency           TEXT NOT NULL DEFAULT 'COP',
  business_hours     JSONB NOT NULL DEFAULT '{}',
  payment_methods    TEXT[] NOT NULL DEFAULT ARRAY['cash_on_delivery'],
  transfer_details   JSONB NOT NULL DEFAULT '{}',
  quote_ttl_minutes  INTEGER NOT NULL DEFAULT 15 CHECK (quote_ttl_minutes > 0),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, location_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS order_settings_public_slug ON order_settings(public_slug) WHERE public_slug IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_order_settings_tenant ON order_settings(tenant_id);

-- ---- 4. Zonas / tarifas de domicilio ----------------
CREATE TABLE IF NOT EXISTS delivery_zones (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  location_id UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  rule        JSONB NOT NULL DEFAULT '{}',                   -- barrios / radio; método de cálculo pendiente de decisión
  fee         NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (fee >= 0),
  active      BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_delivery_zones_tenant   ON delivery_zones(tenant_id);
CREATE INDEX IF NOT EXISTS idx_delivery_zones_location ON delivery_zones(location_id);

-- ---- 5. RLS: solo service_role (API) ---------------
ALTER TABLE order_settings      ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_zones      ENABLE ROW LEVEL SECURITY;
