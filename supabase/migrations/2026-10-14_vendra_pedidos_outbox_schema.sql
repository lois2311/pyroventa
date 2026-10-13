-- =====================================================
-- VENDRA PEDIDOS — PR-05: outbox transaccional y registro de eventos de integración
--
-- ADITIVO e idempotente. No toca invoices, caja ni inventario.
-- Todo el acceso pasa por la API con service_role; RLS activa y sin políticas.
--
-- Revisar y ejecutar a mano en el SQL Editor de Supabase ANTES de desplegar el código.
-- =====================================================

-- ---- 1. Outbox: notificaciones salientes durables ----
-- Una fila = una intención local de notificar algo. El worker la entrega con
-- reintentos (backoff exponencial con jitter); al agotar max_attempts queda 'failed'
-- y visible para soporte. 'processing' tiene arrendamiento: si el worker muere, la
-- fila (updated_at antiguo) se reclama de nuevo.
CREATE TABLE IF NOT EXISTS connect_outbox (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  event_type      TEXT NOT NULL,                       -- p. ej. 'order.accepted'
  aggregate_type  TEXT NOT NULL,                       -- p. ej. 'order_request'
  aggregate_id    UUID NOT NULL,
  payload         JSONB NOT NULL DEFAULT '{}',         -- sin datos personales: el handler los resuelve por tenant_id + aggregate_id
  status          TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'processing', 'delivered', 'failed')),
  attempts        INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  max_attempts    INTEGER NOT NULL DEFAULT 5 CHECK (max_attempts > 0),
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  error_details   TEXT,
  dedupe_key      TEXT,                                -- encolar dos veces el mismo hecho no duplica la notificación
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS connect_outbox_dedupe ON connect_outbox(tenant_id, dedupe_key) WHERE dedupe_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_connect_outbox_tenant    ON connect_outbox(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_connect_outbox_due       ON connect_outbox(next_attempt_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_connect_outbox_lease     ON connect_outbox(updated_at) WHERE status = 'processing';
CREATE INDEX IF NOT EXISTS idx_connect_outbox_failed    ON connect_outbox(tenant_id, updated_at DESC) WHERE status = 'failed';
CREATE INDEX IF NOT EXISTS idx_connect_outbox_aggregate ON connect_outbox(aggregate_type, aggregate_id);

-- ---- 2. Eventos de integración (webhooks entrantes y salientes) ----
-- tenant_id es NULLABLE a propósito: un webhook inválido o de un canal desconocido se
-- registra (rechazado) antes de poder resolver el tenant.
-- Deduplicación: (provider, direction, remote_event_id); sin id remoto, por hash del cuerpo.
-- Ojo: los proveedores reutilizan el id del mensaje en eventos de estado distintos
-- (enviado/entregado/leído): el adaptador debe componer remote_event_id con el estado.
CREATE TABLE IF NOT EXISTS integration_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID REFERENCES tenants(id) ON DELETE CASCADE,
  provider        TEXT NOT NULL,
  remote_event_id TEXT,
  event_hash      TEXT NOT NULL,                       -- sha256 del cuerpo recibido
  direction       TEXT NOT NULL DEFAULT 'inbound' CHECK (direction IN ('inbound', 'outbound')),
  status          TEXT NOT NULL DEFAULT 'received'
                  CHECK (status IN ('received', 'processed', 'ignored', 'failed')),
  payload         JSONB,                               -- minimizado; nunca tokens ni teléfonos completos en logs
  attempts        INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  error_details   TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS integration_events_remote ON integration_events(provider, direction, remote_event_id) WHERE remote_event_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS integration_events_hash   ON integration_events(provider, direction, event_hash) WHERE remote_event_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_integration_events_tenant ON integration_events(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_integration_events_status ON integration_events(status, created_at);

-- ---- 3. RLS: solo service_role (API) ----------------
ALTER TABLE connect_outbox      ENABLE ROW LEVEL SECURITY;
ALTER TABLE integration_events  ENABLE ROW LEVEL SECURITY;
