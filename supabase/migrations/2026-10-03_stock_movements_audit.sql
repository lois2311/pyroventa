-- =====================================================
-- Auditoría completa de movimientos de stock.
-- Idempotente y aditiva. Requiere 2026-10-02_flexible_inventory_and_thresholds.sql.
-- =====================================================

-- 1. Motivos adicionales: reposición, merma y traslado
ALTER TABLE stock_movements DROP CONSTRAINT IF EXISTS stock_movements_reason_check;
ALTER TABLE stock_movements ADD CONSTRAINT stock_movements_reason_check
  CHECK (reason IN ('sale', 'refund', 'manual_adjustment', 'initial_load', 'bulk_upload',
                    'restock', 'damage', 'transfer'));

-- 2. Quién, con qué saldo previo, referencia del proveedor y lote de recepción
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS user_name    VARCHAR(120);
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS user_role    VARCHAR(50);
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS stock_before INTEGER;
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS reference    VARCHAR(100);
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS notes        TEXT;
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS batch_id     UUID;

CREATE INDEX IF NOT EXISTS idx_stock_movements_batch  ON stock_movements(batch_id) WHERE batch_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_stock_movements_tenant ON stock_movements(tenant_id, created_at DESC);

-- 3. Bitácora de solo inserción: la API (service_role) no puede editar ni borrar movimientos.
--    (Las cascadas por borrar un producto/empresa/punto las ejecuta el dueño de la tabla.)
REVOKE UPDATE, DELETE ON stock_movements FROM PUBLIC, anon, authenticated, service_role;
REVOKE TRUNCATE, TRIGGER ON stock_movements FROM PUBLIC, anon, authenticated, service_role;
REVOKE INSERT ON stock_movements FROM anon, authenticated;  -- solo la API (service_role) y apply_stock_delta escriben

-- 4. apply_stock_delta registra además saldo previo, usuario (nombre y rol), referencia y lote.
--    Se reemplaza la firma de 9 parámetros por una de 11 con valores por defecto: las llamadas
--    anteriores (9 parámetros con nombre) siguen funcionando igual.
DROP FUNCTION IF EXISTS apply_stock_delta(UUID, UUID, UUID, INTEGER, TEXT, UUID, UUID, BOOLEAN, TEXT);

CREATE OR REPLACE FUNCTION apply_stock_delta(
  p_tenant_id      UUID,
  p_location_id    UUID,
  p_product_id     UUID,
  p_delta          INTEGER,
  p_reason         TEXT,
  p_invoice_id     UUID    DEFAULT NULL,
  p_user_id        UUID    DEFAULT NULL,
  p_allow_negative BOOLEAN DEFAULT true,
  p_notes          TEXT    DEFAULT NULL,
  p_reference      TEXT    DEFAULT NULL,
  p_batch_id       UUID    DEFAULT NULL
) RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current INTEGER;
  v_new     INTEGER;
  v_name    TEXT;
  v_role    TEXT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM locations WHERE id = p_location_id AND tenant_id = p_tenant_id)
     OR NOT EXISTS (SELECT 1 FROM products WHERE id = p_product_id AND tenant_id = p_tenant_id) THEN
    RAISE EXCEPTION 'STOCK_TENANT_MISMATCH' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO stock (tenant_id, product_id, location_id, quantity)
  VALUES (p_tenant_id, p_product_id, p_location_id, 0)
  ON CONFLICT (product_id, location_id) DO NOTHING;

  SELECT quantity INTO v_current
    FROM stock
   WHERE product_id = p_product_id AND location_id = p_location_id AND tenant_id = p_tenant_id
     FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'STOCK_TENANT_MISMATCH' USING ERRCODE = 'P0002';
  END IF;

  v_new := v_current + p_delta;
  IF v_new < 0 AND NOT p_allow_negative THEN
    RAISE EXCEPTION 'INSUFFICIENT_STOCK' USING ERRCODE = 'P0001', DETAIL = v_current::TEXT;
  END IF;

  UPDATE stock SET quantity = v_new, updated_at = now()
   WHERE product_id = p_product_id AND location_id = p_location_id;

  IF p_user_id IS NOT NULL THEN
    SELECT name, role INTO v_name, v_role FROM sellers WHERE id = p_user_id AND tenant_id = p_tenant_id;
  END IF;

  INSERT INTO stock_movements
    (tenant_id, location_id, product_id, delta, stock_before, final_stock, reason, invoice_id,
     user_id, user_name, user_role, reference, batch_id, notes)
  VALUES
    (p_tenant_id, p_location_id, p_product_id, p_delta, v_current, v_new, p_reason, p_invoice_id,
     p_user_id, LEFT(v_name, 120), v_role, LEFT(p_reference, 100), p_batch_id,
     COALESCE(p_notes, CASE WHEN v_new < 0 THEN 'Saldo negativo por venta' END));

  RETURN v_new;
END;
$$;

REVOKE ALL ON FUNCTION apply_stock_delta(UUID, UUID, UUID, INTEGER, TEXT, UUID, UUID, BOOLEAN, TEXT, TEXT, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION apply_stock_delta(UUID, UUID, UUID, INTEGER, TEXT, UUID, UUID, BOOLEAN, TEXT, TEXT, UUID)
  TO service_role;
