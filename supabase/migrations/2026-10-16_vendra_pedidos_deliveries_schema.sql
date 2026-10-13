-- =====================================================
-- VENDRA PEDIDOS — PR-07: entregas (domicilios)
--
-- ADITIVO e idempotente. Depende de 2026-10-12 a 2026-10-15 (rol 'driver' en sellers, order_requests).
-- No toca invoices, caja ni inventario: entregar no mueve stock ni dinero del POS.
-- Todo el acceso pasa por la API con service_role; RLS activa y sin políticas.
--
-- El domiciliario es un usuario de `sellers` con rol 'driver' (entra con PIN, asignado a su punto en
-- seller_locations); no hay tabla de domiciliarios aparte. Crear la entrega ES la autorización de
-- despacho: un pedido 'accepted' (comercial) no se despacha hasta que alguien le asigna domiciliario.
-- Los datos del destinatario se copian al crear la entrega, para que el domiciliario no necesite
-- acceso a clientes ni pedidos.
--
-- Revisar y ejecutar a mano en el SQL Editor de Supabase ANTES de desplegar el código.
-- =====================================================

CREATE TABLE IF NOT EXISTS deliveries (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  location_id      UUID NOT NULL REFERENCES locations(id),
  order_request_id UUID NOT NULL REFERENCES order_requests(id) ON DELETE CASCADE,
  driver_id        UUID REFERENCES sellers(id) ON DELETE SET NULL,
  status           TEXT NOT NULL DEFAULT 'assigned'
                   CHECK (status IN ('ready_for_dispatch', 'assigned', 'picked_up', 'delivered', 'delivery_failed')),
  instructions     TEXT,
  recipient_name   TEXT NOT NULL,
  recipient_phone  TEXT NOT NULL,
  delivery_address TEXT NOT NULL,
  collect_amount   NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (collect_amount >= 0),  -- efectivo a cobrar (contraentrega); 0 si ya está pagado
  failure_reason   TEXT,
  idempotency_key  TEXT,
  assigned_at      TIMESTAMPTZ,
  picked_up_at     TIMESTAMPTZ,
  delivered_at     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_deliveries_driver ON deliveries(tenant_id, driver_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_order  ON deliveries(tenant_id, order_request_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_status ON deliveries(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_deliveries_loc    ON deliveries(location_id);
-- Un pedido tiene a lo sumo UNA entrega activa; tras un fallo se puede crear otra (queda el historial)
CREATE UNIQUE INDEX IF NOT EXISTS deliveries_one_active
  ON deliveries(order_request_id) WHERE status IN ('ready_for_dispatch', 'assigned', 'picked_up');
CREATE UNIQUE INDEX IF NOT EXISTS deliveries_idem
  ON deliveries(tenant_id, idempotency_key) WHERE idempotency_key IS NOT NULL;

ALTER TABLE deliveries ENABLE ROW LEVEL SECURITY;
