-- Excepción de inventario por producto y por punto.
-- NULL = el producto sigue la regla del punto (locations.tracks_inventory);
-- TRUE = se controla aunque el punto no controle inventario; FALSE = no se controla aunque el punto sí.
ALTER TABLE location_products ADD COLUMN IF NOT EXISTS track_stock BOOLEAN NULL;
