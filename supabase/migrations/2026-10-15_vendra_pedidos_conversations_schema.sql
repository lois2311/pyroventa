-- =====================================================
-- VENDRA PEDIDOS — PR-06: canales de WhatsApp, conversaciones y mensajes
--
-- ADITIVO e idempotente. Depende de las migraciones 2026-10-12 a 2026-10-14.
-- No toca invoices, caja ni inventario. Una conversación NO es un pedido.
-- Todo el acceso pasa por la API con service_role; RLS activa y sin políticas.
--
-- Revisar y ejecutar a mano en el SQL Editor de Supabase ANTES de desplegar el código.
-- Secretos: access_token_secret_ref guarda el NOMBRE de la variable de entorno que contiene
-- el token de acceso de Meta (p. ej. WA_TOKEN_PILOTO); jamás el token.
-- =====================================================

-- ---- 1. Canales de WhatsApp (phone_number_id → tenant → sede) ----
-- Un número no puede pertenecer a dos empresas: phone_number_id es único global.
CREATE TABLE IF NOT EXISTS whatsapp_channels (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  location_id            UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  provider               TEXT NOT NULL DEFAULT 'meta' CHECK (provider IN ('meta')),
  phone_number_id        TEXT NOT NULL,                       -- id del número en Meta (no es el teléfono)
  display_phone_number   TEXT,                                -- enmascarado, solo para mostrar
  status                 TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disconnected')),
  webhook_verify_token   TEXT NOT NULL,                       -- handshake GET del webhook; único
  access_token_secret_ref TEXT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_channels_phone_number ON whatsapp_channels(provider, phone_number_id);
CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_channels_verify_token ON whatsapp_channels(webhook_verify_token);
CREATE INDEX IF NOT EXISTS idx_whatsapp_channels_tenant ON whatsapp_channels(tenant_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_channels_loc    ON whatsapp_channels(location_id);

-- ---- 2. Conversaciones ------------------------------
CREATE TABLE IF NOT EXISTS conversations (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  location_id          UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  channel_id           UUID NOT NULL REFERENCES whatsapp_channels(id) ON DELETE CASCADE,
  customer_id          UUID REFERENCES customers(id) ON DELETE SET NULL,
  remote_chat_id       TEXT NOT NULL,                         -- wa_id del cliente (dígitos, sin +)
  status               TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'archived')),
  assigned_to          UUID REFERENCES sellers(id) ON DELETE SET NULL,
  last_message_at      TIMESTAMPTZ,
  last_inbound_at      TIMESTAMPTZ,                           -- abre la ventana de atención de 24 h de Meta
  last_message_preview TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Un hilo por cliente y canal
CREATE UNIQUE INDEX IF NOT EXISTS conversations_channel_chat ON conversations(tenant_id, channel_id, remote_chat_id);
CREATE INDEX IF NOT EXISTS idx_conversations_chat   ON conversations(tenant_id, remote_chat_id);
CREATE INDEX IF NOT EXISTS idx_conversations_inbox  ON conversations(tenant_id, location_id, status, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_cust   ON conversations(customer_id);

-- ---- 3. Mensajes ------------------------------------
CREATE TABLE IF NOT EXISTS messages (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  conversation_id   UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  direction         TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  type              TEXT NOT NULL DEFAULT 'text' CHECK (type IN ('text', 'interactive', 'image')),
  body              TEXT,
  remote_message_id TEXT,                                     -- wamid; único por empresa
  status            TEXT NOT NULL DEFAULT 'received'
                    CHECK (status IN ('received', 'queued', 'sent', 'delivered', 'read', 'failed')),
  sent_by           UUID REFERENCES sellers(id) ON DELETE SET NULL,   -- operador que respondió
  idempotency_key   TEXT,                                     -- respuestas humanas y notificaciones: un envío por clave
  raw_payload       JSONB,                                    -- mensaje tal como llegó; datos personales: nunca a logs
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS messages_remote ON messages(tenant_id, remote_message_id) WHERE remote_message_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS messages_idem   ON messages(tenant_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(tenant_id, conversation_id, created_at DESC);

-- ---- 4. RLS: solo service_role (API) ----------------
ALTER TABLE whatsapp_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations     ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages          ENABLE ROW LEVEL SECURITY;
