-- =====================================================
-- VENDRA PEDIDOS — PR-03: solicitudes, clientes, direcciones y pagos manuales
--
-- ADITIVO e idempotente. Depende de 2026-10-12_vendra_pedidos_schema.sql.
-- No toca invoices, caja ni inventario: una solicitud NO es una factura.
-- Todo el acceso pasa por la API con service_role; RLS activa y sin políticas.
--
-- Revisar y ejecutar a mano en el SQL Editor de Supabase ANTES de desplegar el código.
-- =====================================================

-- ---- 1. Política de aceptación de transferencias ----
ALTER TABLE order_settings ADD COLUMN IF NOT EXISTS accept_policy TEXT NOT NULL DEFAULT 'require_verified'
  CHECK (accept_policy IN ('require_verified', 'allow_pending_transfer'));

-- ---- 2. Clientes y direcciones ----------------------
CREATE TABLE IF NOT EXISTS customers (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  phone      TEXT NOT NULL CHECK (phone ~ '^\+[1-9][0-9]{7,14}$'),   -- E.164
  name       TEXT,
  consent_at TIMESTAMPTZ,                                            -- aceptación de tratamiento de datos
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, phone)
);
CREATE INDEX IF NOT EXISTS idx_customers_tenant ON customers(tenant_id);

CREATE TABLE IF NOT EXISTS customer_addresses (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_id     UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  address         TEXT NOT NULL,
  details         TEXT,
  reference_notes TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_customer_addresses_tenant   ON customer_addresses(tenant_id);
CREATE INDEX IF NOT EXISTS idx_customer_addresses_customer ON customer_addresses(customer_id);

-- ---- 3. Solicitudes de pedido -----------------------
-- Estado comercial únicamente. La logística (ready_for_dispatch, entregas) llega en PR-07:
-- accepted != ready_for_dispatch.
CREATE TABLE IF NOT EXISTS order_requests (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  location_id     UUID NOT NULL REFERENCES locations(id),
  customer_id     UUID NOT NULL REFERENCES customers(id),
  address_id      UUID REFERENCES customer_addresses(id) ON DELETE SET NULL,   -- NULL = recogida en tienda
  source          TEXT NOT NULL DEFAULT 'web' CHECK (source IN ('web', 'whatsapp', 'manual')),
  fulfillment     TEXT NOT NULL DEFAULT 'delivery' CHECK (fulfillment IN ('delivery', 'pickup')),
  status          TEXT NOT NULL DEFAULT 'submitted'
                  CHECK (status IN ('draft', 'submitted', 'under_review', 'accepted', 'rejected', 'cancelled')),
  subtotal        NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
  delivery_fee    NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (delivery_fee >= 0),
  total           NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (total >= 0),
  snapshot        JSONB NOT NULL DEFAULT '{}',        -- cotización, cliente y entrega congelados al enviar
  notes           TEXT,
  reject_reason   TEXT,
  history         JSONB NOT NULL DEFAULT '[]',        -- auditoría: [{at, action, actor, from, to, reason, key}]
  idempotency_key TEXT,
  public_token    TEXT NOT NULL DEFAULT replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS order_requests_public_token ON order_requests(public_token);
CREATE UNIQUE INDEX IF NOT EXISTS order_requests_idem ON order_requests(tenant_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_order_requests_tenant ON order_requests(tenant_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_order_requests_loc    ON order_requests(location_id);
CREATE INDEX IF NOT EXISTS idx_order_requests_cust   ON order_requests(customer_id);

CREATE TABLE IF NOT EXISTS order_request_items (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  order_request_id UUID NOT NULL REFERENCES order_requests(id) ON DELETE CASCADE,
  product_id       UUID REFERENCES products(id) ON DELETE SET NULL,
  presentation_id  UUID REFERENCES presentations(id) ON DELETE SET NULL,
  name             TEXT NOT NULL,                      -- snapshot del producto
  label            TEXT NOT NULL,                      -- snapshot de la presentación
  unit_price       NUMERIC(12,2) NOT NULL CHECK (unit_price >= 0),
  quantity         INTEGER NOT NULL CHECK (quantity > 0),
  subtotal         NUMERIC(12,2) NOT NULL CHECK (subtotal >= 0)
);
CREATE INDEX IF NOT EXISTS idx_order_items_tenant  ON order_request_items(tenant_id);
CREATE INDEX IF NOT EXISTS idx_order_items_request ON order_request_items(order_request_id);

-- ---- 4. Pagos manuales (separados de la caja del POS) ----
-- Una fila por solicitud. Verificar una transferencia aquí NO es cobrar en caja.
CREATE TABLE IF NOT EXISTS payment_records (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  order_request_id UUID NOT NULL REFERENCES order_requests(id) ON DELETE CASCADE,
  method           TEXT NOT NULL CHECK (method IN ('cash_on_delivery', 'transfer')),
  status           TEXT NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending', 'proof_submitted', 'manually_verified', 'rejected')),
  reference        TEXT,
  proof_url        TEXT,
  verified_by      UUID REFERENCES sellers(id) ON DELETE SET NULL,
  verified_at      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (order_request_id)
);
CREATE INDEX IF NOT EXISTS idx_payment_records_tenant ON payment_records(tenant_id);

-- ---- 5. RLS: solo service_role (API) ----------------
ALTER TABLE customers           ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_addresses  ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_requests      ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_request_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_records     ENABLE ROW LEVEL SECURITY;
