-- =====================================================
-- VENDRA PEDIDOS — Fase 1, PR 1: esquema base
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
  accept_policy      TEXT NOT NULL DEFAULT 'require_verified'
                     CHECK (accept_policy IN ('require_verified', 'allow_pending_transfer')),
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

-- ---- 5. Canales WhatsApp (phone_number_id → tenant → sede) ----
CREATE TABLE IF NOT EXISTS whatsapp_channels (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  location_id    UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  provider       TEXT NOT NULL CHECK (provider IN ('meta', 'twilio')),
  remote_id      TEXT NOT NULL,                              -- phone_number_id (Meta) / sender SID (Twilio)
  display_number TEXT,                                       -- enmascarado
  status         TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'disabled')),
  secret_ref     TEXT,                                       -- referencia al secreto; nunca el token en claro
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider, remote_id)
);
CREATE INDEX IF NOT EXISTS idx_whatsapp_channels_tenant ON whatsapp_channels(tenant_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_channels_loc    ON whatsapp_channels(location_id);

-- ---- 6. Clientes y direcciones ----------------------
CREATE TABLE IF NOT EXISTS customers (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  phone      TEXT NOT NULL,                                  -- E.164 normalizado
  name       TEXT,
  consent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, phone)
);
CREATE INDEX IF NOT EXISTS idx_customers_tenant ON customers(tenant_id);

CREATE TABLE IF NOT EXISTS customer_addresses (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  address     TEXT NOT NULL,
  reference   TEXT,
  latitude    NUMERIC(9,6),
  longitude   NUMERIC(9,6),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_customer_addresses_tenant   ON customer_addresses(tenant_id);
CREATE INDEX IF NOT EXISTS idx_customer_addresses_customer ON customer_addresses(customer_id);

-- ---- 7. Conversaciones y mensajes -------------------
CREATE TABLE IF NOT EXISTS conversations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  location_id     UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  channel_id      UUID REFERENCES whatsapp_channels(id) ON DELETE SET NULL,
  customer_id     UUID REFERENCES customers(id) ON DELETE SET NULL,
  status          TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'pending', 'closed')),
  assigned_to     UUID REFERENCES sellers(id) ON DELETE SET NULL,
  remote_id       TEXT,                                      -- id de hilo del proveedor
  last_message_at TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_conversations_tenant ON conversations(tenant_id, status, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_loc    ON conversations(location_id);
CREATE INDEX IF NOT EXISTS idx_conversations_cust   ON conversations(customer_id);

CREATE TABLE IF NOT EXISTS messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  direction       TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  type            TEXT NOT NULL DEFAULT 'text',
  body            TEXT,
  media_url       TEXT,
  remote_id       TEXT,                                      -- id del mensaje en el proveedor
  delivery_status TEXT NOT NULL DEFAULT 'received'
                  CHECK (delivery_status IN ('received', 'queued', 'sent', 'delivered', 'read', 'failed')),
  sent_by         UUID REFERENCES sellers(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_messages_tenant ON messages(tenant_id);
CREATE INDEX IF NOT EXISTS idx_messages_conv   ON messages(conversation_id, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS messages_conv_remote ON messages(conversation_id, remote_id) WHERE remote_id IS NOT NULL;

-- ---- 8. Solicitudes de pedido -----------------------
CREATE TABLE IF NOT EXISTS order_requests (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  location_id     UUID NOT NULL REFERENCES locations(id),
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  customer_id     UUID REFERENCES customers(id) ON DELETE SET NULL,
  address_id      UUID REFERENCES customer_addresses(id) ON DELETE SET NULL,
  source          TEXT NOT NULL CHECK (source IN ('whatsapp', 'web', 'manual')),
  status          TEXT NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft', 'submitted', 'under_review', 'accepted', 'fulfilled', 'rejected', 'cancelled')),
  payment_status  TEXT NOT NULL DEFAULT 'not_required'
                  CHECK (payment_status IN ('not_required', 'cash_on_delivery', 'transfer_pending', 'proof_submitted', 'manually_verified', 'rejected')),
  delivery_status TEXT NOT NULL DEFAULT 'not_required'
                  CHECK (delivery_status IN ('not_required', 'ready_for_dispatch', 'assigned', 'picked_up', 'delivered', 'delivery_failed')),
  subtotal        NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
  delivery_fee    NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (delivery_fee >= 0),
  total           NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (total >= 0),
  quoted_at       TIMESTAMPTZ,
  quote_expires_at TIMESTAMPTZ,
  delivery_snapshot JSONB NOT NULL DEFAULT '{}',             -- dirección/notas congeladas al enviar
  reject_reason   TEXT,
  public_token    TEXT NOT NULL DEFAULT replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  idempotency_key TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS order_requests_public_token ON order_requests(public_token);
CREATE UNIQUE INDEX IF NOT EXISTS order_requests_idem ON order_requests(tenant_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_order_requests_tenant ON order_requests(tenant_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_order_requests_loc    ON order_requests(location_id);
CREATE INDEX IF NOT EXISTS idx_order_requests_cust   ON order_requests(customer_id);
CREATE INDEX IF NOT EXISTS idx_order_requests_conv   ON order_requests(conversation_id);

CREATE TABLE IF NOT EXISTS order_request_items (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  order_request_id UUID NOT NULL REFERENCES order_requests(id) ON DELETE CASCADE,
  presentation_id  UUID REFERENCES presentations(id) ON DELETE SET NULL,
  product_id       UUID REFERENCES products(id) ON DELETE SET NULL,
  product_name     TEXT NOT NULL,                            -- snapshot
  label            TEXT NOT NULL,
  unit_price       NUMERIC(12,2) NOT NULL CHECK (unit_price >= 0),
  quantity         INTEGER NOT NULL CHECK (quantity > 0),
  subtotal         NUMERIC(12,2) NOT NULL CHECK (subtotal >= 0)
);
CREATE INDEX IF NOT EXISTS idx_order_items_tenant  ON order_request_items(tenant_id);
CREATE INDEX IF NOT EXISTS idx_order_items_request ON order_request_items(order_request_id);

-- ---- 9. Pagos manuales (separados de la caja del POS) ----
CREATE TABLE IF NOT EXISTS payment_records (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  order_request_id UUID NOT NULL REFERENCES order_requests(id) ON DELETE CASCADE,
  method           TEXT NOT NULL CHECK (method IN ('cash_on_delivery', 'transfer')),
  status           TEXT NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending', 'proof_submitted', 'manually_verified', 'rejected')),
  reference        TEXT,
  evidence_url     TEXT,
  verified_by      UUID REFERENCES sellers(id) ON DELETE SET NULL,
  verified_at      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_payment_records_tenant  ON payment_records(tenant_id);
CREATE INDEX IF NOT EXISTS idx_payment_records_request ON payment_records(order_request_id);

-- ---- 10. Domiciliarios y entregas -------------------
CREATE TABLE IF NOT EXISTS delivery_agents (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  location_id UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  seller_id   UUID REFERENCES sellers(id) ON DELETE SET NULL, -- usuario con rol 'driver' (modelo de acceso pendiente)
  name        TEXT NOT NULL,
  phone       TEXT,
  active      BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_delivery_agents_tenant ON delivery_agents(tenant_id);
CREATE INDEX IF NOT EXISTS idx_delivery_agents_loc    ON delivery_agents(location_id);
CREATE UNIQUE INDEX IF NOT EXISTS delivery_agents_seller ON delivery_agents(tenant_id, seller_id) WHERE seller_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS deliveries (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  location_id      UUID NOT NULL REFERENCES locations(id),
  order_request_id UUID NOT NULL REFERENCES order_requests(id) ON DELETE CASCADE,
  agent_id         UUID REFERENCES delivery_agents(id) ON DELETE SET NULL,
  status           TEXT NOT NULL DEFAULT 'ready_for_dispatch'
                   CHECK (status IN ('ready_for_dispatch', 'assigned', 'picked_up', 'delivered', 'delivery_failed')),
  instructions     TEXT,
  assigned_at      TIMESTAMPTZ,
  picked_up_at     TIMESTAMPTZ,
  delivered_at     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_deliveries_tenant  ON deliveries(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_deliveries_loc     ON deliveries(location_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_request ON deliveries(order_request_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_agent   ON deliveries(agent_id);

-- ---- 11. Eventos de integración y outbox ------------
-- tenant_id es NULLABLE a propósito: un webhook inválido o de canal desconocido
-- se registra (rechazado) antes de poder resolver el tenant.
CREATE TABLE IF NOT EXISTS integration_events (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID REFERENCES tenants(id) ON DELETE CASCADE,
  provider   TEXT NOT NULL,
  event_id   TEXT NOT NULL,                                  -- id remoto; deduplicación
  direction  TEXT NOT NULL DEFAULT 'inbound' CHECK (direction IN ('inbound', 'outbound')),
  payload_hash TEXT,
  payload    JSONB,                                          -- minimizado; sin tokens ni teléfonos completos en logs
  status     TEXT NOT NULL DEFAULT 'received'
             CHECK (status IN ('received', 'processed', 'rejected', 'failed')),
  reject_reason TEXT,
  attempts   INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ,
  UNIQUE (provider, event_id)
);
CREATE INDEX IF NOT EXISTS idx_integration_events_tenant ON integration_events(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_integration_events_status ON integration_events(status, created_at);

CREATE TABLE IF NOT EXISTS connect_outbox (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  type            TEXT NOT NULL,                             -- p. ej. 'whatsapp.message'
  aggregate_id    UUID,
  payload         JSONB NOT NULL DEFAULT '{}',
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
  attempts        INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_error      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at         TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_connect_outbox_tenant ON connect_outbox(tenant_id);
CREATE INDEX IF NOT EXISTS idx_connect_outbox_due    ON connect_outbox(status, next_attempt_at) WHERE status = 'pending';

-- ---- 12. RLS: solo service_role (API) ---------------
ALTER TABLE order_settings      ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_zones      ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_channels   ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers           ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_addresses  ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations       ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages            ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_requests      ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_request_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_records     ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_agents     ENABLE ROW LEVEL SECURITY;
ALTER TABLE deliveries          ENABLE ROW LEVEL SECURITY;
ALTER TABLE integration_events  ENABLE ROW LEVEL SECURITY;
ALTER TABLE connect_outbox      ENABLE ROW LEVEL SECURITY;
