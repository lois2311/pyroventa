-- =====================================================
-- Inventario flexible: seguimiento por producto y por punto,
-- umbrales de stock bajo y descuento de stock atómico.
-- Idempotente. Todo aditivo: los productos existentes quedan
-- con track_stock = true (comportamiento actual).
-- Requiere 2026-09-18_multi_tenant_inventory.sql ya aplicada.
-- =====================================================

ALTER TABLE products  ADD COLUMN IF NOT EXISTS track_stock BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE products  ADD COLUMN IF NOT EXISTS min_stock   INTEGER NULL CHECK (min_stock IS NULL OR min_stock >= 0);
ALTER TABLE tenants   ADD COLUMN IF NOT EXISTS low_stock_threshold INTEGER NOT NULL DEFAULT 5 CHECK (low_stock_threshold >= 0);
ALTER TABLE locations ADD COLUMN IF NOT EXISTS tracks_inventory BOOLEAN NOT NULL DEFAULT true;

-- Aplica un delta de stock y registra el movimiento en una sola transacción.
-- La fila de stock se bloquea (FOR UPDATE): dos cobros simultáneos se serializan
-- y ninguno pierde su resta. Devuelve la existencia resultante.
--   p_allow_negative = false -> lanza INSUFFICIENT_STOCK si el saldo quedaría < 0
--   p_allow_negative = true  -> permite saldo negativo (ventas offline sincronizadas)
--                               y lo deja anotado en stock_movements.notes
CREATE OR REPLACE FUNCTION apply_stock_delta(
  p_tenant_id      UUID,
  p_location_id    UUID,
  p_product_id     UUID,
  p_delta          INTEGER,
  p_reason         TEXT,
  p_invoice_id     UUID    DEFAULT NULL,
  p_user_id        UUID    DEFAULT NULL,
  p_allow_negative BOOLEAN DEFAULT true,
  p_notes          TEXT    DEFAULT NULL
) RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current INTEGER;
  v_new     INTEGER;
BEGIN
  -- Producto y punto deben ser del tenant (la función corre como definer)
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

  INSERT INTO stock_movements
    (tenant_id, location_id, product_id, delta, final_stock, reason, invoice_id, user_id, notes)
  VALUES
    (p_tenant_id, p_location_id, p_product_id, p_delta, v_new, p_reason, p_invoice_id, p_user_id,
     COALESCE(p_notes, CASE WHEN v_new < 0 THEN 'Saldo negativo por venta' END));

  RETURN v_new;
END;
$$;

-- Solo el backend (service_role) la invoca; no exponerla por PostgREST a anon/authenticated.
REVOKE ALL ON FUNCTION apply_stock_delta(UUID, UUID, UUID, INTEGER, TEXT, UUID, UUID, BOOLEAN, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION apply_stock_delta(UUID, UUID, UUID, INTEGER, TEXT, UUID, UUID, BOOLEAN, TEXT)
  TO service_role;
