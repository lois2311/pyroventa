-- =====================================================
-- PyroVenta — Migración: fotos de productos
-- Ejecutar en el SQL Editor del dashboard de Supabase.
-- NO destructivo: solo agrega la columna image_url.
-- =====================================================

ALTER TABLE products ADD COLUMN IF NOT EXISTS image_url TEXT;

-- El bucket de Storage `product-images` (público) lo crea automáticamente
-- la API en el primer upload, o manualmente con:
--   node scripts/setup-product-images.mjs
