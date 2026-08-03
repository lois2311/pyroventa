-- =====================================================
-- PyroVenta — Detalle de la transferencia
--
-- Cuando el pago es por transferencia, guarda por cuál billetera/banco
-- entró la plata (Nequi, Daviplata o Bancolombia). Solo aplica a
-- pay_method = 'transfer'; en efectivo y datáfono queda NULL.
--
-- Ejecutar en el SQL Editor de Supabase.
-- Sin esta migración la API sigue cobrando normal, pero no guarda el detalle.
-- =====================================================

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS transfer_provider TEXT;

ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_transfer_provider_check;
ALTER TABLE invoices ADD CONSTRAINT invoices_transfer_provider_check
  CHECK (transfer_provider IS NULL OR transfer_provider IN ('nequi', 'daviplata', 'bancolombia'));

-- Coherencia: solo las transferencias pueden llevar proveedor
ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_transfer_provider_only_transfer;
ALTER TABLE invoices ADD CONSTRAINT invoices_transfer_provider_only_transfer
  CHECK (transfer_provider IS NULL OR pay_method = 'transfer');

-- Para el desglose de transferencias por proveedor en los reportes
CREATE INDEX IF NOT EXISTS idx_invoices_transfer_provider
  ON invoices (tenant_id, transfer_provider)
  WHERE transfer_provider IS NOT NULL;
