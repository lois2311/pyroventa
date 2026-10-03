-- Descuento al cobrar: motivo obligatorio y quién lo aplicó
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS discount_reason  TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS discount_by      UUID REFERENCES sellers(id);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS discount_by_name TEXT;
