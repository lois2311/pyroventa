-- =====================================================
-- PyroVenta — Seed Data
-- Ejecutar DESPUÉS de schema.sql
-- =====================================================

-- ---- PUNTOS DE VENTA --------------------------------
INSERT INTO locations (id, name, address, printer_config) VALUES
  ('11111111-0000-0000-0000-000000000001', 'Local Principal',  'Av. Principal #45-12',                '{"printer_name":"POS-80","paper_width":"80mm","chars_per_line":48,"header_lines":["PIROTÉCNICA LA CHISPA","Av. Principal #45-12"],"footer_lines":["¡Gracias por su compra!","Manipule con responsabilidad"],"use_qz_tray":true}'),
  ('11111111-0000-0000-0000-000000000002', 'Stand Norte',       'Centro Comercial Norte, Local 203',   '{"printer_name":"POS-58","paper_width":"58mm","chars_per_line":32,"header_lines":["PIROTÉCNICA LA CHISPA","CC Norte, Local 203"],"footer_lines":["¡Gracias por su compra!","Manipule con responsabilidad"],"use_qz_tray":false}'),
  ('11111111-0000-0000-0000-000000000003', 'Stand Sur',         'Galería Sur, Puesto 8',               '{"printer_name":"POS-58","paper_width":"58mm","chars_per_line":32,"header_lines":["PIROTÉCNICA LA CHISPA","Galería Sur, Puesto 8"],"footer_lines":["¡Gracias por su compra!","Manipule con responsabilidad"],"use_qz_tray":false}')
ON CONFLICT (id) DO NOTHING;


-- ---- CATEGORÍAS -------------------------------------
INSERT INTO categories (id, name, icon, sort_order) VALUES
  ('22222222-0000-0000-0000-000000000001', 'Infantiles',   '🎆', 1),
  ('22222222-0000-0000-0000-000000000002', 'Familia',      '🎇', 2),
  ('22222222-0000-0000-0000-000000000003', 'Profesional',  '💥', 3),
  ('22222222-0000-0000-0000-000000000004', 'Explosivos',   '🧨', 4)
ON CONFLICT (id) DO NOTHING;


-- ---- VENDEDORES -------------------------------------
-- PINs: Carlos→1111, Sandra→2222, Javier→3333, María→4444, Admin→0000
INSERT INTO sellers (id, name, pin, role) VALUES
  ('33333333-0000-0000-0000-000000000001', 'Carlos',  '1111', 'seller'),
  ('33333333-0000-0000-0000-000000000002', 'Sandra',  '2222', 'seller'),
  ('33333333-0000-0000-0000-000000000003', 'Javier',  '3333', 'seller'),
  ('33333333-0000-0000-0000-000000000004', 'María',   '4444', 'cashier'),
  ('33333333-0000-0000-0000-000000000005', 'Admin',   '0000', 'admin')
ON CONFLICT (id) DO NOTHING;


-- ---- ASIGNACIÓN VENDEDOR ↔ PUNTO DE VENTA ----------
-- Carlos → Local Principal + Stand Norte
-- Sandra → Local Principal
-- Javier → Stand Norte + Stand Sur
-- María  → Stand Sur
-- Admin  → todos
INSERT INTO seller_locations (seller_id, location_id) VALUES
  ('33333333-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001'), -- Carlos → Principal
  ('33333333-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000002'), -- Carlos → Norte
  ('33333333-0000-0000-0000-000000000002', '11111111-0000-0000-0000-000000000001'), -- Sandra → Principal
  ('33333333-0000-0000-0000-000000000003', '11111111-0000-0000-0000-000000000002'), -- Javier → Norte
  ('33333333-0000-0000-0000-000000000003', '11111111-0000-0000-0000-000000000003'), -- Javier → Sur
  ('33333333-0000-0000-0000-000000000004', '11111111-0000-0000-0000-000000000003'), -- María  → Sur
  ('33333333-0000-0000-0000-000000000005', '11111111-0000-0000-0000-000000000001'), -- Admin  → Principal
  ('33333333-0000-0000-0000-000000000005', '11111111-0000-0000-0000-000000000002'), -- Admin  → Norte
  ('33333333-0000-0000-0000-000000000005', '11111111-0000-0000-0000-000000000003')  -- Admin  → Sur
ON CONFLICT DO NOTHING;


-- ---- PRODUCTOS Y PRESENTACIONES ---------------------

-- 1. Tiro al blanco (Infantiles)
INSERT INTO products (id, name, category_id) VALUES
  ('44444444-0000-0000-0000-000000000001', 'Tiro al blanco', '22222222-0000-0000-0000-000000000001')
ON CONFLICT (id) DO NOTHING;
INSERT INTO presentations (product_id, label, price) VALUES
  ('44444444-0000-0000-0000-000000000001', 'Unidad',    2500),
  ('44444444-0000-0000-0000-000000000001', 'Pack x12', 25000),
  ('44444444-0000-0000-0000-000000000001', 'Caja x48', 85000)
ON CONFLICT DO NOTHING;

-- 2. Bengala colores (Infantiles)
INSERT INTO products (id, name, category_id) VALUES
  ('44444444-0000-0000-0000-000000000002', 'Bengala colores', '22222222-0000-0000-0000-000000000001')
ON CONFLICT (id) DO NOTHING;
INSERT INTO presentations (product_id, label, price) VALUES
  ('44444444-0000-0000-0000-000000000002', 'Unidad',     1500),
  ('44444444-0000-0000-0000-000000000002', 'Pack x10',  12000),
  ('44444444-0000-0000-0000-000000000002', 'Caja x100', 100000)
ON CONFLICT DO NOTHING;

-- 3. Volcán pequeño (Infantiles)
INSERT INTO products (id, name, category_id) VALUES
  ('44444444-0000-0000-0000-000000000003', 'Volcán pequeño', '22222222-0000-0000-0000-000000000001')
ON CONFLICT (id) DO NOTHING;
INSERT INTO presentations (product_id, label, price) VALUES
  ('44444444-0000-0000-0000-000000000003', 'Unidad',   4500),
  ('44444444-0000-0000-0000-000000000003', 'Pack x6', 22000)
ON CONFLICT DO NOTHING;

-- 4. Serpentina de fuego (Infantiles)
INSERT INTO products (id, name, category_id) VALUES
  ('44444444-0000-0000-0000-000000000004', 'Serpentina de fuego', '22222222-0000-0000-0000-000000000001')
ON CONFLICT (id) DO NOTHING;
INSERT INTO presentations (product_id, label, price) VALUES
  ('44444444-0000-0000-0000-000000000004', 'Unidad',     800),
  ('44444444-0000-0000-0000-000000000004', 'Bolsa x20', 12000),
  ('44444444-0000-0000-0000-000000000004', 'Caja x100', 50000)
ON CONFLICT DO NOTHING;

-- 5. Bomba de colores (Familia)
INSERT INTO products (id, name, category_id) VALUES
  ('44444444-0000-0000-0000-000000000005', 'Bomba de colores', '22222222-0000-0000-0000-000000000002')
ON CONFLICT (id) DO NOTHING;
INSERT INTO presentations (product_id, label, price) VALUES
  ('44444444-0000-0000-0000-000000000005', 'Unidad',   8000),
  ('44444444-0000-0000-0000-000000000005', 'Pack x6', 40000)
ON CONFLICT DO NOTHING;

-- 6. Pistola de chispas (Familia)
INSERT INTO products (id, name, category_id) VALUES
  ('44444444-0000-0000-0000-000000000006', 'Pistola de chispas', '22222222-0000-0000-0000-000000000002')
ON CONFLICT (id) DO NOTHING;
INSERT INTO presentations (product_id, label, price) VALUES
  ('44444444-0000-0000-0000-000000000006', 'Unidad',  12000),
  ('44444444-0000-0000-0000-000000000006', 'Pack x2', 22000)
ON CONFLICT DO NOTHING;

-- 7. Globo de luz (Familia)
INSERT INTO products (id, name, category_id) VALUES
  ('44444444-0000-0000-0000-000000000007', 'Globo de luz', '22222222-0000-0000-0000-000000000002')
ON CONFLICT (id) DO NOTHING;
INSERT INTO presentations (product_id, label, price) VALUES
  ('44444444-0000-0000-0000-000000000007', 'Unidad',   3500),
  ('44444444-0000-0000-0000-000000000007', 'Pack x5', 15000),
  ('44444444-0000-0000-0000-000000000007', 'Caja x20',55000)
ON CONFLICT DO NOTHING;

-- 8. Castillo pirotécnico (Profesional)
INSERT INTO products (id, name, category_id) VALUES
  ('44444444-0000-0000-0000-000000000008', 'Castillo pirotécnico', '22222222-0000-0000-0000-000000000003')
ON CONFLICT (id) DO NOTHING;
INSERT INTO presentations (product_id, label, price) VALUES
  ('44444444-0000-0000-0000-000000000008', 'Pequeño',  35000),
  ('44444444-0000-0000-0000-000000000008', 'Mediano',  65000),
  ('44444444-0000-0000-0000-000000000008', 'Grande',  120000)
ON CONFLICT DO NOTHING;

-- 9. Candelilla romana (Profesional)
INSERT INTO products (id, name, category_id) VALUES
  ('44444444-0000-0000-0000-000000000009', 'Candelilla romana', '22222222-0000-0000-0000-000000000003')
ON CONFLICT (id) DO NOTHING;
INSERT INTO presentations (product_id, label, price) VALUES
  ('44444444-0000-0000-0000-000000000009', 'Unidad',   15000),
  ('44444444-0000-0000-0000-000000000009', 'Caja x12', 150000)
ON CONFLICT DO NOTHING;

-- 10. Display de fuente (Profesional)
INSERT INTO products (id, name, category_id) VALUES
  ('44444444-0000-0000-0000-000000000010', 'Display de fuente', '22222222-0000-0000-0000-000000000003')
ON CONFLICT (id) DO NOTHING;
INSERT INTO presentations (product_id, label, price) VALUES
  ('44444444-0000-0000-0000-000000000010', 'Kit básico',   85000),
  ('44444444-0000-0000-0000-000000000010', 'Kit premium', 180000),
  ('44444444-0000-0000-0000-000000000010', 'Kit show',    350000)
ON CONFLICT DO NOTHING;

-- 11. Trueno navideño (Explosivos)
INSERT INTO products (id, name, category_id) VALUES
  ('44444444-0000-0000-0000-000000000011', 'Trueno navideño', '22222222-0000-0000-0000-000000000004')
ON CONFLICT (id) DO NOTHING;
INSERT INTO presentations (product_id, label, price) VALUES
  ('44444444-0000-0000-0000-000000000011', 'Unidad',    2000),
  ('44444444-0000-0000-0000-000000000011', 'Pack x20', 30000),
  ('44444444-0000-0000-0000-000000000011', 'Caja x100',120000)
ON CONFLICT DO NOTHING;

-- 12. Volador sin palo (Explosivos)
INSERT INTO products (id, name, category_id) VALUES
  ('44444444-0000-0000-0000-000000000012', 'Volador sin palo', '22222222-0000-0000-0000-000000000004')
ON CONFLICT (id) DO NOTHING;
INSERT INTO presentations (product_id, label, price) VALUES
  ('44444444-0000-0000-0000-000000000012', 'Unidad',   3000),
  ('44444444-0000-0000-0000-000000000012', 'Pack x10', 25000),
  ('44444444-0000-0000-0000-000000000012', 'Caja x50', 100000)
ON CONFLICT DO NOTHING;


-- ---- STOCK inicial (100 unidades de todo en Local Principal) ----
INSERT INTO stock (product_id, location_id, quantity)
SELECT p.id, '11111111-0000-0000-0000-000000000001', 100
FROM products p
ON CONFLICT (product_id, location_id) DO NOTHING;

INSERT INTO stock (product_id, location_id, quantity)
SELECT p.id, '11111111-0000-0000-0000-000000000002', 50
FROM products p
ON CONFLICT (product_id, location_id) DO NOTHING;

INSERT INTO stock (product_id, location_id, quantity)
SELECT p.id, '11111111-0000-0000-0000-000000000003', 50
FROM products p
ON CONFLICT (product_id, location_id) DO NOTHING;
