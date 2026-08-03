-- =====================================================
-- PyroVenta — Idempotencia al crear facturas
--
-- Problema: el cliente reintenta (api.js hasta 2 veces, y la cola offline
-- otra vez). Si el INSERT entra pero la respuesta se pierde por red, el
-- reintento crea una SEGUNDA factura por la misma venta. En el ledger eso
-- es plata duplicada.
--
-- El POS ya genera un id local por operación; ahora lo manda como
-- client_op_id y la BD garantiza que solo una factura lo use por empresa.
-- El reintento entonces choca contra el índice y la API devuelve la factura
-- que ya existía en vez de crear otra.
--
-- Ejecutar en el SQL Editor de Supabase.
-- Sin esta migración la API sigue facturando, pero sin protección de duplicados.
-- =====================================================

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS client_op_id UUID;

-- Parcial: las facturas viejas (y las de clientes que aún no lo mandan)
-- tienen NULL y no colisionan entre sí.
CREATE UNIQUE INDEX IF NOT EXISTS invoices_client_op_id_unique
  ON invoices (tenant_id, client_op_id)
  WHERE client_op_id IS NOT NULL;
