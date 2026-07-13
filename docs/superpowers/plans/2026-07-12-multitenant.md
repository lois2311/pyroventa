# PyroVenta Multitenant — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convertir PyroVenta en multitenant: tabla `tenants`, `tenant_id` en todas las tablas, JWT firmado, acceso por `/c/<slug>`, y panel `/super` donde el super admin crea clientes, gestiona vigencia de licencia y ve métricas globales.

**Architecture:** Base compartida (un Supabase, un deploy Vercel) con columna `tenant_id` en todas las tablas. La API (catch-all `api/[[...path]].js` con service key) es la única capa de acceso a datos y filtra TODO por el `tenantId` del JWT. El super admin autentica con email+bcrypt y usa rutas `/super/*`.

**Tech Stack:** React 18 + Vite (PWA), Zustand, Supabase (Postgres, service key en serverless), Vercel Functions, `jose` (JWT HS256), `bcryptjs`, `vitest` (nuevo, para helpers puros).

**Spec:** `docs/superpowers/specs/2026-07-12-multitenant-design.md`

## Global Constraints

- Todo en español (mensajes de error, UI, comentarios) — igual que el código existente.
- Un solo serverless function (catch-all) — límite de 12 funciones del plan Hobby de Vercel. Los handlers nuevos van en `api/_lib/` (Vercel NO convierte `_lib` en funciones).
- `tenant_id` en escrituras SIEMPRE sale del token, nunca del body.
- Módulos ESM (`"type": "module"` ya está en package.json).
- Claims del JWT de cliente: `{ tenantId, sellerId, locationId, role }`, expiración `7d`. JWT super admin: `{ role: 'super_admin', superAdminId }`, expiración `24h`. Secreto: env `JWT_SECRET`.
- Códigos de error de licencia: `TENANT_NOT_FOUND`, `TENANT_SUSPENDED`, `LICENSE_NOT_STARTED`, `LICENSE_EXPIRED` (siempre en campo `code` del JSON de error).
- Claves de localStorage: token cliente `pv_token` (existente), slug `pv_tenant_slug` (nueva), token super admin `pv_super_token` (nueva).
- Decisión que ajusta el spec: `GET /public/tenant/:slug` devuelve `{ tenant, locations }` (NO sellers — el login es por PIN, nunca se listan vendedores sin autenticar).
- No hay datos reales: `schema.sql` hace DROP + CREATE.

---

### Task 1: Schema y seed multitenant (SQL) + script de hash

**Files:**
- Modify: `supabase/schema.sql` (reemplazo completo)
- Modify: `supabase/seed.sql` (reemplazo completo)
- Create: `scripts/hash-password.mjs`

**Interfaces:**
- Produces: tablas `tenants`, `super_admins`; columna `tenant_id UUID NOT NULL` en `locations`, `sellers`, `seller_locations`, `categories`, `products`, `presentations`, `stock`, `registers`, `invoices`; funciones SQL `get_next_invoice_code(p_location_id UUID)` (sin cambios de firma) y `tenant_last_activity()` → `TABLE(tenant_id UUID, last_invoice_at TIMESTAMPTZ)`.
- Produces (seed): tenant demo `slug='demo'` id `00000000-0000-0000-0000-000000000001`, vigencia 2026-01-01 → 2026-12-31.

- [ ] **Step 1: Reemplazar `supabase/schema.sql` completo**

```sql
-- =====================================================
-- PyroVenta — Schema Supabase (PostgreSQL) — MULTITENANT
-- Ejecutar en el SQL Editor del dashboard de Supabase.
-- ¡DESTRUCTIVO! Borra y recrea todas las tablas.
-- =====================================================

DROP TABLE IF EXISTS invoices         CASCADE;
DROP TABLE IF EXISTS registers        CASCADE;
DROP TABLE IF EXISTS stock            CASCADE;
DROP TABLE IF EXISTS presentations    CASCADE;
DROP TABLE IF EXISTS products         CASCADE;
DROP TABLE IF EXISTS categories       CASCADE;
DROP TABLE IF EXISTS seller_locations CASCADE;
DROP TABLE IF EXISTS sellers          CASCADE;
DROP TABLE IF EXISTS locations        CASCADE;
DROP TABLE IF EXISTS super_admins     CASCADE;
DROP TABLE IF EXISTS tenants          CASCADE;

-- ---- TENANTS (empresas clientes) --------------------
CREATE TABLE tenants (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  slug          TEXT NOT NULL UNIQUE,
  active        BOOLEAN NOT NULL DEFAULT true,
  license_start DATE NOT NULL,
  license_end   DATE NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---- SUPER ADMINS (dueño de la plataforma) ----------
CREATE TABLE super_admins (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,       -- bcrypt (generar con scripts/hash-password.mjs)
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---- PUNTOS DE VENTA --------------------------------
CREATE TABLE locations (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  address        TEXT,
  printer_config JSONB NOT NULL DEFAULT '{}',
  active         BOOLEAN NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---- VENDEDORES -------------------------------------
CREATE TABLE sellers (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  pin        CHAR(4) NOT NULL,
  role       TEXT NOT NULL DEFAULT 'seller'
             CHECK (role IN ('seller', 'cashier', 'admin')),
  active     BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---- RELACIÓN VENDEDOR ↔ PUNTO DE VENTA (N:M) ------
CREATE TABLE seller_locations (
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  seller_id   UUID NOT NULL REFERENCES sellers(id)   ON DELETE CASCADE,
  location_id UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  PRIMARY KEY (seller_id, location_id)
);

-- ---- CATEGORÍAS (por tenant) ------------------------
CREATE TABLE categories (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  icon       TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  active     BOOLEAN NOT NULL DEFAULT true
);

-- ---- PRODUCTOS (por tenant) -------------------------
CREATE TABLE products (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  category_id UUID REFERENCES categories(id),
  description TEXT,
  active      BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---- PRESENTACIONES (por producto) -----------------
CREATE TABLE presentations (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  label      TEXT NOT NULL,
  price      NUMERIC(12,2) NOT NULL,
  active     BOOLEAN NOT NULL DEFAULT true
);

-- ---- STOCK (por punto de venta) --------------------
CREATE TABLE stock (
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  product_id  UUID NOT NULL REFERENCES products(id)   ON DELETE CASCADE,
  location_id UUID NOT NULL REFERENCES locations(id)  ON DELETE CASCADE,
  quantity    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (product_id, location_id)
);

-- ---- CAJAS / REGISTRADORAS (por punto de venta) ----
CREATE TABLE registers (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  location_id UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  active      BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---- FACTURAS ---------------------------------------
CREATE TABLE invoices (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  code          CHAR(4) NOT NULL,
  location_id   UUID NOT NULL REFERENCES locations(id),
  location_name TEXT,
  seller_id     UUID REFERENCES sellers(id),
  seller_name   TEXT,
  total         NUMERIC(12,2) NOT NULL DEFAULT 0,
  status        TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'paid', 'cancelled')),
  pay_method    TEXT CHECK (pay_method IN ('cash', 'transfer', 'card')),
  items         JSONB NOT NULL DEFAULT '[]',
  register_id   UUID REFERENCES registers(id),
  register_name TEXT,
  cashier_id    UUID REFERENCES sellers(id),
  cashier_name  TEXT,
  observations  TEXT,
  edited_by     UUID REFERENCES sellers(id),
  edited_at     TIMESTAMPTZ,
  printed       BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  paid_at       TIMESTAMPTZ,
  cancelled_at  TIMESTAMPTZ
);

-- ---- ÍNDICES ----------------------------------------
CREATE INDEX idx_locations_tenant     ON locations(tenant_id);
CREATE INDEX idx_sellers_tenant       ON sellers(tenant_id);
CREATE INDEX idx_seller_locs_tenant   ON seller_locations(tenant_id);
CREATE INDEX idx_categories_tenant    ON categories(tenant_id);
CREATE INDEX idx_products_tenant      ON products(tenant_id);
CREATE INDEX idx_presentations_tenant ON presentations(tenant_id);
CREATE INDEX idx_stock_tenant         ON stock(tenant_id);
CREATE INDEX idx_registers_tenant     ON registers(tenant_id);
CREATE INDEX idx_registers_location   ON registers(location_id);
CREATE INDEX idx_invoices_tenant      ON invoices(tenant_id);

CREATE UNIQUE INDEX invoices_pending_code_location
  ON invoices(code, location_id)
  WHERE status = 'pending';

CREATE INDEX idx_invoices_code_location   ON invoices(code, location_id);
CREATE INDEX idx_invoices_location_status ON invoices(location_id, status);
CREATE INDEX idx_invoices_created_at      ON invoices(created_at);

-- =====================================================
-- FUNCIÓN: Generación atómica de código aleatorio (sin cambios de firma)
-- =====================================================
CREATE OR REPLACE FUNCTION get_next_invoice_code(p_location_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_code INTEGER;
  v_attempts INTEGER := 0;
BEGIN
  LOOP
    v_code := 1000 + floor(random() * 9000)::INTEGER;
    v_attempts := v_attempts + 1;

    IF NOT EXISTS (
      SELECT 1 FROM invoices
      WHERE location_id = p_location_id AND status = 'pending' AND code = v_code::TEXT
    ) THEN
      RETURN v_code::TEXT;
    END IF;

    IF v_attempts >= 50 THEN
      FOR v_code IN 1000..9999 LOOP
        IF NOT EXISTS (
          SELECT 1 FROM invoices
          WHERE location_id = p_location_id AND status = 'pending' AND code = v_code::TEXT
        ) THEN
          RETURN v_code::TEXT;
        END IF;
      END LOOP;
      RAISE EXCEPTION 'No hay códigos disponibles para este punto de venta';
    END IF;
  END LOOP;
END;
$$;

-- =====================================================
-- FUNCIÓN: Última actividad por tenant (panel super admin)
-- =====================================================
CREATE OR REPLACE FUNCTION tenant_last_activity()
RETURNS TABLE(tenant_id UUID, last_invoice_at TIMESTAMPTZ)
LANGUAGE sql
AS $$
  SELECT tenant_id, max(created_at) FROM invoices GROUP BY tenant_id
$$;

-- =====================================================
-- ROW LEVEL SECURITY
-- Toda operación de datos pasa por la API con service key (bypasea RLS).
-- La anon key del frontend queda SOLO para el canal realtime;
-- sin políticas, no puede leer ninguna tabla.
-- =====================================================
ALTER TABLE tenants          ENABLE ROW LEVEL SECURITY;
ALTER TABLE super_admins     ENABLE ROW LEVEL SECURITY;
ALTER TABLE locations        ENABLE ROW LEVEL SECURITY;
ALTER TABLE sellers          ENABLE ROW LEVEL SECURITY;
ALTER TABLE seller_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories       ENABLE ROW LEVEL SECURITY;
ALTER TABLE products         ENABLE ROW LEVEL SECURITY;
ALTER TABLE presentations    ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock            ENABLE ROW LEVEL SECURITY;
ALTER TABLE registers        ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices         ENABLE ROW LEVEL SECURITY;
```

- [ ] **Step 2: Reemplazar `supabase/seed.sql` completo**

Mismo contenido demo que antes, pero con tenant. Reemplazar el archivo completo:

```sql
-- =====================================================
-- PyroVenta — Seed Data (MULTITENANT)
-- Ejecutar DESPUÉS de schema.sql
-- =====================================================

-- ---- TENANT DEMO ------------------------------------
INSERT INTO tenants (id, name, slug, active, license_start, license_end) VALUES
  ('00000000-0000-0000-0000-000000000001', 'Pirotécnica La Chispa (Demo)', 'demo', true, '2026-01-01', '2026-12-31')
ON CONFLICT (id) DO NOTHING;

-- ---- SUPER ADMIN ------------------------------------
-- Generar el hash con:  node scripts/hash-password.mjs <tu-contraseña>
-- y reemplazar el valor de password_hash antes de ejecutar.
INSERT INTO super_admins (email, password_hash) VALUES
  ('miguel.sanchez@super.com.co', '$2a$10$REEMPLAZAR_CON_HASH_REAL')
ON CONFLICT (email) DO NOTHING;

-- ---- PUNTOS DE VENTA --------------------------------
INSERT INTO locations (id, tenant_id, name, address, printer_config) VALUES
  ('11111111-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Local Principal', 'Av. Principal #45-12', '{"printer_name":"POS-80","paper_width":"80mm","chars_per_line":48,"header_lines":["PIROTÉCNICA LA CHISPA","Av. Principal #45-12"],"footer_lines":["¡Gracias por su compra!","Manipule con responsabilidad"],"use_qz_tray":true}'),
  ('11111111-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'Stand Norte', 'Centro Comercial Norte, Local 203', '{"printer_name":"POS-58","paper_width":"58mm","chars_per_line":32,"header_lines":["PIROTÉCNICA LA CHISPA","CC Norte, Local 203"],"footer_lines":["¡Gracias por su compra!","Manipule con responsabilidad"],"use_qz_tray":false}'),
  ('11111111-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 'Stand Sur', 'Galería Sur, Puesto 8', '{"printer_name":"POS-58","paper_width":"58mm","chars_per_line":32,"header_lines":["PIROTÉCNICA LA CHISPA","Galería Sur, Puesto 8"],"footer_lines":["¡Gracias por su compra!","Manipule con responsabilidad"],"use_qz_tray":false}')
ON CONFLICT (id) DO NOTHING;

-- ---- CATEGORÍAS -------------------------------------
INSERT INTO categories (id, tenant_id, name, icon, sort_order) VALUES
  ('22222222-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Infantiles',  '🎆', 1),
  ('22222222-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'Familia',     '🎇', 2),
  ('22222222-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 'Profesional', '💥', 3),
  ('22222222-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001', 'Explosivos',  '🧨', 4)
ON CONFLICT (id) DO NOTHING;

-- ---- VENDEDORES -------------------------------------
-- PINs: Carlos→1111, Sandra→2222, Javier→3333, María→4444, Admin→0000
INSERT INTO sellers (id, tenant_id, name, pin, role) VALUES
  ('33333333-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Carlos', '1111', 'seller'),
  ('33333333-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'Sandra', '2222', 'seller'),
  ('33333333-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 'Javier', '3333', 'seller'),
  ('33333333-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001', 'María',  '4444', 'cashier'),
  ('33333333-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000001', 'Admin',  '0000', 'admin')
ON CONFLICT (id) DO NOTHING;

-- ---- ASIGNACIÓN VENDEDOR ↔ PUNTO DE VENTA ----------
INSERT INTO seller_locations (tenant_id, seller_id, location_id) VALUES
  ('00000000-0000-0000-0000-000000000001', '33333333-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-000000000001', '33333333-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000002'),
  ('00000000-0000-0000-0000-000000000001', '33333333-0000-0000-0000-000000000002', '11111111-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-000000000001', '33333333-0000-0000-0000-000000000003', '11111111-0000-0000-0000-000000000002'),
  ('00000000-0000-0000-0000-000000000001', '33333333-0000-0000-0000-000000000003', '11111111-0000-0000-0000-000000000003'),
  ('00000000-0000-0000-0000-000000000001', '33333333-0000-0000-0000-000000000004', '11111111-0000-0000-0000-000000000003'),
  ('00000000-0000-0000-0000-000000000001', '33333333-0000-0000-0000-000000000005', '11111111-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-000000000001', '33333333-0000-0000-0000-000000000005', '11111111-0000-0000-0000-000000000002'),
  ('00000000-0000-0000-0000-000000000001', '33333333-0000-0000-0000-000000000005', '11111111-0000-0000-0000-000000000003')
ON CONFLICT DO NOTHING;

-- ---- PRODUCTOS Y PRESENTACIONES ---------------------
INSERT INTO products (id, tenant_id, name, category_id) VALUES
  ('44444444-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Tiro al blanco',       '22222222-0000-0000-0000-000000000001'),
  ('44444444-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'Bengala colores',      '22222222-0000-0000-0000-000000000001'),
  ('44444444-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 'Volcán pequeño',       '22222222-0000-0000-0000-000000000001'),
  ('44444444-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001', 'Serpentina de fuego',  '22222222-0000-0000-0000-000000000001'),
  ('44444444-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000001', 'Bomba de colores',     '22222222-0000-0000-0000-000000000002'),
  ('44444444-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000001', 'Pistola de chispas',   '22222222-0000-0000-0000-000000000002'),
  ('44444444-0000-0000-0000-000000000007', '00000000-0000-0000-0000-000000000001', 'Globo de luz',         '22222222-0000-0000-0000-000000000002'),
  ('44444444-0000-0000-0000-000000000008', '00000000-0000-0000-0000-000000000001', 'Castillo pirotécnico', '22222222-0000-0000-0000-000000000003'),
  ('44444444-0000-0000-0000-000000000009', '00000000-0000-0000-0000-000000000001', 'Candelilla romana',    '22222222-0000-0000-0000-000000000003'),
  ('44444444-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000001', 'Display de fuente',    '22222222-0000-0000-0000-000000000003'),
  ('44444444-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000001', 'Trueno navideño',      '22222222-0000-0000-0000-000000000004'),
  ('44444444-0000-0000-0000-000000000012', '00000000-0000-0000-0000-000000000001', 'Volador sin palo',     '22222222-0000-0000-0000-000000000004')
ON CONFLICT (id) DO NOTHING;

INSERT INTO presentations (tenant_id, product_id, label, price) VALUES
  ('00000000-0000-0000-0000-000000000001', '44444444-0000-0000-0000-000000000001', 'Unidad',      2500),
  ('00000000-0000-0000-0000-000000000001', '44444444-0000-0000-0000-000000000001', 'Pack x12',   25000),
  ('00000000-0000-0000-0000-000000000001', '44444444-0000-0000-0000-000000000001', 'Caja x48',   85000),
  ('00000000-0000-0000-0000-000000000001', '44444444-0000-0000-0000-000000000002', 'Unidad',      1500),
  ('00000000-0000-0000-0000-000000000001', '44444444-0000-0000-0000-000000000002', 'Pack x10',   12000),
  ('00000000-0000-0000-0000-000000000001', '44444444-0000-0000-0000-000000000002', 'Caja x100', 100000),
  ('00000000-0000-0000-0000-000000000001', '44444444-0000-0000-0000-000000000003', 'Unidad',      4500),
  ('00000000-0000-0000-0000-000000000001', '44444444-0000-0000-0000-000000000003', 'Pack x6',    22000),
  ('00000000-0000-0000-0000-000000000001', '44444444-0000-0000-0000-000000000004', 'Unidad',       800),
  ('00000000-0000-0000-0000-000000000001', '44444444-0000-0000-0000-000000000004', 'Bolsa x20',  12000),
  ('00000000-0000-0000-0000-000000000001', '44444444-0000-0000-0000-000000000004', 'Caja x100',  50000),
  ('00000000-0000-0000-0000-000000000001', '44444444-0000-0000-0000-000000000005', 'Unidad',      8000),
  ('00000000-0000-0000-0000-000000000001', '44444444-0000-0000-0000-000000000005', 'Pack x6',    40000),
  ('00000000-0000-0000-0000-000000000001', '44444444-0000-0000-0000-000000000006', 'Unidad',     12000),
  ('00000000-0000-0000-0000-000000000001', '44444444-0000-0000-0000-000000000006', 'Pack x2',    22000),
  ('00000000-0000-0000-0000-000000000001', '44444444-0000-0000-0000-000000000007', 'Unidad',      3500),
  ('00000000-0000-0000-0000-000000000001', '44444444-0000-0000-0000-000000000007', 'Pack x5',    15000),
  ('00000000-0000-0000-0000-000000000001', '44444444-0000-0000-0000-000000000007', 'Caja x20',   55000),
  ('00000000-0000-0000-0000-000000000001', '44444444-0000-0000-0000-000000000008', 'Pequeño',    35000),
  ('00000000-0000-0000-0000-000000000001', '44444444-0000-0000-0000-000000000008', 'Mediano',    65000),
  ('00000000-0000-0000-0000-000000000001', '44444444-0000-0000-0000-000000000008', 'Grande',    120000),
  ('00000000-0000-0000-0000-000000000001', '44444444-0000-0000-0000-000000000009', 'Unidad',     15000),
  ('00000000-0000-0000-0000-000000000001', '44444444-0000-0000-0000-000000000009', 'Caja x12',  150000),
  ('00000000-0000-0000-0000-000000000001', '44444444-0000-0000-0000-000000000010', 'Kit básico',  85000),
  ('00000000-0000-0000-0000-000000000001', '44444444-0000-0000-0000-000000000010', 'Kit premium',180000),
  ('00000000-0000-0000-0000-000000000001', '44444444-0000-0000-0000-000000000010', 'Kit show',   350000),
  ('00000000-0000-0000-0000-000000000001', '44444444-0000-0000-0000-000000000011', 'Unidad',      2000),
  ('00000000-0000-0000-0000-000000000001', '44444444-0000-0000-0000-000000000011', 'Pack x20',   30000),
  ('00000000-0000-0000-0000-000000000001', '44444444-0000-0000-0000-000000000011', 'Caja x100', 120000),
  ('00000000-0000-0000-0000-000000000001', '44444444-0000-0000-0000-000000000012', 'Unidad',      3000),
  ('00000000-0000-0000-0000-000000000001', '44444444-0000-0000-0000-000000000012', 'Pack x10',   25000),
  ('00000000-0000-0000-0000-000000000001', '44444444-0000-0000-0000-000000000012', 'Caja x50',  100000)
ON CONFLICT DO NOTHING;

-- ---- STOCK inicial ----------------------------------
INSERT INTO stock (tenant_id, product_id, location_id, quantity)
SELECT '00000000-0000-0000-0000-000000000001', p.id, '11111111-0000-0000-0000-000000000001', 100
FROM products p ON CONFLICT (product_id, location_id) DO NOTHING;

INSERT INTO stock (tenant_id, product_id, location_id, quantity)
SELECT '00000000-0000-0000-0000-000000000001', p.id, '11111111-0000-0000-0000-000000000002', 50
FROM products p ON CONFLICT (product_id, location_id) DO NOTHING;

INSERT INTO stock (tenant_id, product_id, location_id, quantity)
SELECT '00000000-0000-0000-0000-000000000001', p.id, '11111111-0000-0000-0000-000000000003', 50
FROM products p ON CONFLICT (product_id, location_id) DO NOTHING;
```

- [ ] **Step 3: Crear `scripts/hash-password.mjs`**

```js
// Genera un hash bcrypt para super_admins.password_hash
// Uso: node scripts/hash-password.mjs <contraseña>
import bcrypt from 'bcryptjs'

const pwd = process.argv[2]
if (!pwd) {
  console.error('Uso: node scripts/hash-password.mjs <contraseña>')
  process.exit(1)
}
console.log(bcrypt.hashSync(pwd, 10))
```

(Requiere `bcryptjs`, que se instala en Task 2; este script solo se ejecuta manualmente.)

- [ ] **Step 4: Verificar sintaxis SQL**

No hay runner local de Postgres. Verificación: revisar visualmente que cada `INSERT` liste `tenant_id` y que cada tabla tenga la columna. La ejecución real contra Supabase ocurre en Task 11.

- [ ] **Step 5: Commit**

```bash
git add supabase/schema.sql supabase/seed.sql scripts/hash-password.mjs
git commit -m "feat(db): schema multitenant con tenants, super_admins y tenant_id en todas las tablas"
```

---

### Task 2: Helpers puros con tests (JWT, estado de tenant, slug)

**Files:**
- Create: `api/_lib/jwt.js`
- Create: `api/_lib/tenantStatus.js`
- Create: `api/_lib/slug.js`
- Test: `api/_lib/__tests__/jwt.test.js`, `api/_lib/__tests__/tenantStatus.test.js`, `api/_lib/__tests__/slug.test.js`
- Modify: `package.json` (deps + script test)

**Interfaces:**
- Produces: `signToken(payload: object, expiresIn?: string) → Promise<string>` y `verifyJwt(token: string) → Promise<object>` (lanza si inválido/expirado) desde `jwt.js`.
- Produces: `getTenantStatus(tenant: {active, license_start, license_end} | null, today?: Date) → { ok: boolean, code?: string, message?: string }` desde `tenantStatus.js`. Códigos: `TENANT_NOT_FOUND`, `TENANT_SUSPENDED`, `LICENSE_NOT_STARTED`, `LICENSE_EXPIRED`.
- Produces: `slugify(name: string) → string` desde `slug.js` (kebab-case, sin acentos, máx 40 chars).

- [ ] **Step 1: Instalar dependencias y agregar script de test**

```bash
npm install jose bcryptjs
npm install -D vitest
```

En `package.json`, agregar a `"scripts"`:

```json
"test": "vitest run"
```

- [ ] **Step 2: Escribir los tests (fallarán — los módulos no existen)**

`api/_lib/__tests__/jwt.test.js`:

```js
import { describe, it, expect, beforeAll } from 'vitest'
import { signToken, verifyJwt } from '../jwt.js'

beforeAll(() => { process.env.JWT_SECRET = 'test-secret-para-vitest' })

describe('jwt', () => {
  it('firma y verifica un token con sus claims', async () => {
    const token = await signToken({ tenantId: 't1', sellerId: 's1', locationId: 'l1', role: 'seller' })
    const claims = await verifyJwt(token)
    expect(claims.tenantId).toBe('t1')
    expect(claims.sellerId).toBe('s1')
    expect(claims.role).toBe('seller')
  })

  it('rechaza un token manipulado', async () => {
    const token = await signToken({ tenantId: 't1' })
    const tampered = token.slice(0, -2) + 'xx'
    await expect(verifyJwt(tampered)).rejects.toThrow()
  })

  it('rechaza un token expirado', async () => {
    const token = await signToken({ tenantId: 't1' }, '-10s')
    await expect(verifyJwt(token)).rejects.toThrow()
  })

  it('rechaza un token forjado tipo base64 (formato viejo)', async () => {
    const fake = Buffer.from('seller-id:location-id').toString('base64')
    await expect(verifyJwt(fake)).rejects.toThrow()
  })
})
```

`api/_lib/__tests__/tenantStatus.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { getTenantStatus } from '../tenantStatus.js'

const base = { active: true, license_start: '2026-01-01', license_end: '2026-12-31' }
const dia = (s) => new Date(`${s}T12:00:00Z`)

describe('getTenantStatus', () => {
  it('tenant null → TENANT_NOT_FOUND', () => {
    expect(getTenantStatus(null).code).toBe('TENANT_NOT_FOUND')
  })
  it('tenant inactivo → TENANT_SUSPENDED', () => {
    expect(getTenantStatus({ ...base, active: false }, dia('2026-06-15')).code).toBe('TENANT_SUSPENDED')
  })
  it('antes de license_start → LICENSE_NOT_STARTED', () => {
    expect(getTenantStatus(base, dia('2025-12-31')).code).toBe('LICENSE_NOT_STARTED')
  })
  it('después de license_end → LICENSE_EXPIRED', () => {
    expect(getTenantStatus(base, dia('2027-01-01')).code).toBe('LICENSE_EXPIRED')
  })
  it('license_end es inclusivo', () => {
    expect(getTenantStatus(base, dia('2026-12-31')).ok).toBe(true)
  })
  it('vigente → ok', () => {
    expect(getTenantStatus(base, dia('2026-06-15')).ok).toBe(true)
  })
})
```

`api/_lib/__tests__/slug.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { slugify } from '../slug.js'

describe('slugify', () => {
  it('convierte a kebab-case sin acentos', () => {
    expect(slugify('Pirotécnica El Cohetón')).toBe('pirotecnica-el-coheton')
  })
  it('elimina caracteres especiales', () => {
    expect(slugify('¡Chispas & Truenos S.A.S.!')).toBe('chispas-truenos-s-a-s')
  })
  it('recorta a 40 caracteres', () => {
    expect(slugify('a'.repeat(60)).length).toBeLessThanOrEqual(40)
  })
  it('string vacío → vacío', () => {
    expect(slugify('')).toBe('')
  })
})
```

- [ ] **Step 3: Correr tests y verificar que fallan**

Run: `npm test`
Expected: FAIL — `Cannot find module '../jwt.js'` (y equivalentes).

- [ ] **Step 4: Implementar los tres módulos**

`api/_lib/jwt.js`:

```js
import { SignJWT, jwtVerify } from 'jose'

function secret() {
  const s = process.env.JWT_SECRET
  if (!s) throw new Error('JWT_SECRET no configurado')
  return new TextEncoder().encode(s)
}

/** Firma un JWT HS256. expiresIn acepta formato jose: '7d', '24h', '-10s' (tests). */
export async function signToken(payload, expiresIn = '7d') {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(secret())
}

/** Verifica firma y expiración. Lanza si es inválido. Retorna los claims. */
export async function verifyJwt(token) {
  const { payload } = await jwtVerify(token, secret())
  return payload
}
```

`api/_lib/tenantStatus.js`:

```js
/**
 * Evalúa si un tenant puede operar hoy.
 * license_start / license_end son strings DATE de Postgres ('2026-12-31').
 * Comparación por string ISO (YYYY-MM-DD) — license_end es inclusivo.
 */
export function getTenantStatus(tenant, today = new Date()) {
  if (!tenant) {
    return { ok: false, code: 'TENANT_NOT_FOUND', message: 'Empresa no encontrada' }
  }
  if (!tenant.active) {
    return { ok: false, code: 'TENANT_SUSPENDED', message: 'Empresa suspendida. Contacte a su proveedor.' }
  }
  const d = today.toISOString().slice(0, 10)
  if (d < tenant.license_start) {
    return { ok: false, code: 'LICENSE_NOT_STARTED', message: 'La licencia aún no está vigente.' }
  }
  if (d > tenant.license_end) {
    return { ok: false, code: 'LICENSE_EXPIRED', message: 'Licencia vencida. Contacte a su proveedor.' }
  }
  return { ok: true }
}
```

`api/_lib/slug.js`:

```js
/** 'Pirotécnica El Cohetón' → 'pirotecnica-el-coheton' (máx 40 chars) */
export function slugify(name) {
  return String(name || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/, '')
}
```

- [ ] **Step 5: Correr tests y verificar que pasan**

Run: `npm test`
Expected: PASS — 14 tests.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json api/_lib/jwt.js api/_lib/tenantStatus.js api/_lib/slug.js api/_lib/__tests__
git commit -m "feat(api): helpers JWT firmado, estado de licencia y slugify con tests"
```

---

### Task 3: Middleware de auth multitenant

**Files:**
- Modify: `api/_lib/auth.js` (reemplazo completo)

**Interfaces:**
- Consumes: `verifyJwt` de `api/_lib/jwt.js`, `getTenantStatus` de `api/_lib/tenantStatus.js`, `supabaseAdmin`.
- Produces: `requireAuth(req, res) → Promise<{ seller: {id,name,role,active}, tenant: {id,name,slug,active,license_start,license_end}, tenantId: string, locationId: string } | null>` (responde 401/403 y retorna null si falla).
- Produces: `requireAdmin(req, res)` — igual que requireAuth pero exige `role === 'admin'` (403 si no).
- Produces: `requireSuperAdmin(req, res) → Promise<{ superAdminId: string } | null>` — solo verifica JWT con `role === 'super_admin'`, sin consulta a BD.

- [ ] **Step 1: Reemplazar `api/_lib/auth.js` completo**

```js
import { supabaseAdmin } from './supabaseAdmin.js'
import { verifyJwt } from './jwt.js'
import { getTenantStatus } from './tenantStatus.js'

function extractToken(req) {
  const authHeader = req.headers['authorization'] || req.headers['Authorization'] || ''
  return authHeader.replace(/^Bearer\s+/i, '').trim()
}

/**
 * Requiere JWT válido de un usuario de tenant.
 * Valida: firma, seller activo en su tenant, tenant activo y con licencia vigente.
 * Responde 401/403 y retorna null si algo falla.
 */
export async function requireAuth(req, res) {
  const token = extractToken(req)
  if (!token) {
    res.status(401).json({ error: 'Token no proporcionado' })
    return null
  }

  let claims
  try {
    claims = await verifyJwt(token)
  } catch {
    res.status(401).json({ error: 'Token inválido o expirado' })
    return null
  }

  const { tenantId, sellerId, locationId } = claims
  if (!tenantId || !sellerId) {
    res.status(401).json({ error: 'Token inválido' })
    return null
  }

  const [sellerRes, tenantRes] = await Promise.all([
    supabaseAdmin.from('sellers')
      .select('id, name, role, active')
      .eq('id', sellerId).eq('tenant_id', tenantId).eq('active', true)
      .single(),
    supabaseAdmin.from('tenants')
      .select('id, name, slug, active, license_start, license_end')
      .eq('id', tenantId)
      .single(),
  ])

  if (sellerRes.error || !sellerRes.data) {
    res.status(401).json({ error: 'Vendedor inactivo o no existe' })
    return null
  }

  const status = getTenantStatus(tenantRes.data)
  if (!status.ok) {
    res.status(403).json({ error: status.message, code: status.code })
    return null
  }

  return { seller: sellerRes.data, tenant: tenantRes.data, tenantId, locationId }
}

/** Requiere rol admin del tenant. */
export async function requireAdmin(req, res) {
  const auth = await requireAuth(req, res)
  if (!auth) return null
  if (auth.seller.role !== 'admin') {
    res.status(403).json({ error: 'Se requiere rol de administrador' })
    return null
  }
  return auth
}

/** Requiere JWT de super admin (sin consulta a BD). */
export async function requireSuperAdmin(req, res) {
  const token = extractToken(req)
  if (!token) {
    res.status(401).json({ error: 'Token no proporcionado' })
    return null
  }
  try {
    const claims = await verifyJwt(token)
    if (claims.role !== 'super_admin' || !claims.superAdminId) throw new Error()
    return { superAdminId: claims.superAdminId }
  } catch {
    res.status(401).json({ error: 'No autorizado' })
    return null
  }
}
```

- [ ] **Step 2: Verificar que los tests existentes siguen pasando y el build compila**

Run: `npm test && npm run build`
Expected: tests PASS, build OK. (La API aún no compila contra esto en runtime — la ruta se actualiza en Task 4; `verifyToken` ya no se exporta y nadie más lo importa: confirmar con `grep -r "verifyToken" src api` → solo referencias dentro de `auth.js` viejo, que desaparece.)

- [ ] **Step 3: Commit**

```bash
git add api/_lib/auth.js
git commit -m "feat(api): middleware de auth con JWT firmado, validación de tenant y super admin"
```

---

### Task 4: Login multitenant y bootstrap público por slug

**Files:**
- Modify: `api/[[...path]].js` (imports, router y `authLogin`; agregar `publicTenantGet`)

**Interfaces:**
- Consumes: `signToken` (jwt.js), `getTenantStatus` (tenantStatus.js).
- Produces: `POST /api/auth/login` body `{ pin, location_id, tenant_slug }` → `{ seller, location, tenant: {id,name,slug}, token }`.
- Produces: `GET /api/public/tenant/:slug` → `{ tenant: {id,name,slug}, locations: [{id,name,address,printer_config}] }`; 404 si no existe, 403 + `code` si suspendido/vencido.

- [ ] **Step 1: Actualizar imports del catch-all**

En `api/[[...path]].js` líneas 1-3, dejar:

```js
import { supabaseAdmin } from './_lib/supabaseAdmin.js'
import { handleCors }    from './_lib/cors.js'
import { requireAuth, requireAdmin } from './_lib/auth.js'
import { signToken }       from './_lib/jwt.js'
import { getTenantStatus } from './_lib/tenantStatus.js'
```

- [ ] **Step 2: Agregar rutas al router**

Después de la línea `if (route === '/auth/login' && method === 'POST') return authLogin(req, res)` agregar:

```js
  // ---- PÚBLICO (bootstrap de login por empresa) -----
  if (segments[0] === 'public' && segments[1] === 'tenant' && segments[2] && method === 'GET') {
    return publicTenantGet(req, res, segments[2])
  }
```

- [ ] **Step 3: Reemplazar la función `authLogin` completa**

```js
async function authLogin(req, res) {
  const { pin, location_id, tenant_slug } = req.body || {}
  if (!pin || !location_id || !tenant_slug) {
    return res.status(400).json({ error: 'PIN, punto de venta y empresa son requeridos' })
  }

  const { data: tenant } = await supabaseAdmin
    .from('tenants')
    .select('id, name, slug, active, license_start, license_end')
    .eq('slug', tenant_slug)
    .single()

  const status = getTenantStatus(tenant)
  if (!status.ok) {
    const httpCode = status.code === 'TENANT_NOT_FOUND' ? 404 : 403
    return res.status(httpCode).json({ error: status.message, code: status.code })
  }

  const { data: sellers, error } = await supabaseAdmin
    .from('sellers')
    .select('id, name, pin, role, active, seller_locations!inner(location_id)')
    .eq('tenant_id', tenant.id)
    .eq('pin', pin).eq('active', true).eq('seller_locations.location_id', location_id)

  if (error) return res.status(500).json({ error: 'Error interno del servidor' })
  let seller = sellers?.[0]

  // Los admin del tenant entran a cualquier punto de venta sin asignación explícita
  if (!seller) {
    const { data: admins } = await supabaseAdmin
      .from('sellers').select('id, name, pin, role, active')
      .eq('tenant_id', tenant.id)
      .eq('pin', pin).eq('role', 'admin').eq('active', true).limit(1)
    seller = admins?.[0]
  }

  if (!seller) return res.status(401).json({ error: 'PIN incorrecto o no autorizado para este punto de venta' })

  const { data: location, error: locErr } = await supabaseAdmin
    .from('locations').select('id, name, address, printer_config')
    .eq('id', location_id).eq('tenant_id', tenant.id).eq('active', true).single()

  if (locErr || !location) return res.status(404).json({ error: 'Punto de venta no encontrado' })

  const token = await signToken({
    tenantId: tenant.id, sellerId: seller.id, locationId: location_id, role: seller.role,
  })

  return res.status(200).json({
    seller:   { id: seller.id, name: seller.name, role: seller.role },
    location: { id: location.id, name: location.name, address: location.address, printer_config: location.printer_config },
    tenant:   { id: tenant.id, name: tenant.name, slug: tenant.slug },
    token,
  })
}
```

- [ ] **Step 4: Agregar la función `publicTenantGet`** (después de `authLogin`)

```js
// =====================================================
// PÚBLICO — bootstrap de login por slug de empresa
// =====================================================
async function publicTenantGet(req, res, slug) {
  const { data: tenant } = await supabaseAdmin
    .from('tenants')
    .select('id, name, slug, active, license_start, license_end')
    .eq('slug', String(slug).toLowerCase())
    .single()

  const status = getTenantStatus(tenant)
  if (!status.ok) {
    const httpCode = status.code === 'TENANT_NOT_FOUND' ? 404 : 403
    return res.status(httpCode).json({ error: status.message, code: status.code })
  }

  const { data: locations, error } = await supabaseAdmin
    .from('locations')
    .select('id, name, address, printer_config')
    .eq('tenant_id', tenant.id).eq('active', true)
    .order('name')

  if (error) return res.status(500).json({ error: error.message })

  return res.status(200).json({
    tenant:    { id: tenant.id, name: tenant.name, slug: tenant.slug },
    locations: locations || [],
  })
}
```

- [ ] **Step 5: Verificar build y tests**

Run: `npm test && npm run build`
Expected: PASS / build OK.

- [ ] **Step 6: Commit**

```bash
git add "api/[[...path]].js"
git commit -m "feat(api): login multitenant con JWT y endpoint publico /public/tenant/:slug"
```

---

### Task 5: Scoping por tenant de todas las rutas existentes

**Files:**
- Modify: `api/[[...path]].js` (todos los handlers excepto `authLogin`/`publicTenantGet`)

**Interfaces:**
- Consumes: `requireAuth` / `requireAdmin` que ahora retornan `{ seller, tenant, tenantId, locationId }`.
- Produces: todas las rutas existentes exigen auth y filtran/escriben `tenant_id`. Sin cambios de contrato para el frontend (mismos paths, mismos shapes de respuesta).

Regla general: **toda lectura** agrega `.eq('tenant_id', auth.tenantId)`; **toda inserción** agrega `tenant_id: auth.tenantId`. Handlers que hoy NO tienen auth (`locationsGet`, `productsGet`, `registersGet`, `invoicesPending`, `invoicesGetByCode`, `invoicesHistory` y los 6 reports) ahora inician con `const auth = await requireAuth(req, res); if (!auth) return`.

- [ ] **Step 1: LOCATIONS — reemplazar los 4 handlers**

```js
async function locationsGet(req, res) {
  const auth = await requireAuth(req, res); if (!auth) return
  const { data, error } = await supabaseAdmin.from('locations')
    .select('id, name, address, printer_config, active')
    .eq('tenant_id', auth.tenantId).order('name')
  if (error) return res.status(500).json({ error: error.message })
  return res.status(200).json(data)
}

async function locationsCreate(req, res) {
  const auth = await requireAdmin(req, res); if (!auth) return
  const { name, address, printer_config } = req.body || {}
  if (!name) return res.status(400).json({ error: 'El nombre es requerido' })
  const defaultConfig = { printer_name: 'POS-80', paper_width: '80mm', chars_per_line: 48, header_lines: [auth.tenant.name.toUpperCase(), address || ''], footer_lines: ['¡Gracias por su compra!', 'Manipule con responsabilidad'], use_qz_tray: false }
  const { data, error } = await supabaseAdmin.from('locations')
    .insert({ tenant_id: auth.tenantId, name, address, printer_config: printer_config || defaultConfig })
    .select().single()
  if (error) return res.status(500).json({ error: error.message })
  return res.status(201).json(data)
}

async function locationsUpdate(req, res, id) {
  const auth = await requireAdmin(req, res); if (!auth) return
  const { name, address, printer_config, active } = req.body || {}
  const u = {}
  if (name !== undefined)           u.name = name
  if (address !== undefined)        u.address = address
  if (printer_config !== undefined) u.printer_config = printer_config
  if (active !== undefined)         u.active = active
  const { data, error } = await supabaseAdmin.from('locations')
    .update(u).eq('id', id).eq('tenant_id', auth.tenantId).select().single()
  if (error) return res.status(500).json({ error: error.message })
  return res.status(200).json(data)
}

async function locationsDelete(req, res, id) {
  const auth = await requireAdmin(req, res); if (!auth) return
  await supabaseAdmin.from('locations').update({ active: false }).eq('id', id).eq('tenant_id', auth.tenantId)
  return res.status(204).end()
}
```

- [ ] **Step 2: PRODUCTS — reemplazar los 5 handlers**

```js
async function productsGet(req, res) {
  const auth = await requireAuth(req, res); if (!auth) return
  const { location_id } = req.query
  const { data: products, error } = await supabaseAdmin.from('products')
    .select('id, name, description, active, categories(id, name, icon, sort_order), presentations(id, label, price, active)')
    .eq('tenant_id', auth.tenantId).eq('active', true).order('name')
  if (error) return res.status(500).json({ error: error.message })
  let result = products.map(p => ({ ...p, presentations: (p.presentations || []).filter(pr => pr.active) }))
  if (location_id) {
    const { data: stockRows } = await supabaseAdmin.from('stock')
      .select('product_id, quantity').eq('location_id', location_id).eq('tenant_id', auth.tenantId)
    const sm = {}; (stockRows || []).forEach(s => { sm[s.product_id] = s.quantity })
    result = result.map(p => ({ ...p, stock_quantity: sm[p.id] ?? 0 }))
  }
  result.sort((a, b) => (a.categories?.sort_order ?? 99) - (b.categories?.sort_order ?? 99) || a.name.localeCompare(b.name, 'es'))
  // private: la respuesta es por tenant — NUNCA cachear en CDN compartido
  res.setHeader('Cache-Control', 'private, max-age=300')
  return res.status(200).json(result)
}

async function productsCreate(req, res) {
  const auth = await requireAdmin(req, res); if (!auth) return
  const { name, category_id, description, presentations = [] } = req.body || {}
  if (!name) return res.status(400).json({ error: 'El nombre es requerido' })
  const { data: product, error: pe } = await supabaseAdmin.from('products')
    .insert({ tenant_id: auth.tenantId, name, category_id, description }).select().single()
  if (pe) return res.status(500).json({ error: pe.message })
  if (presentations.length > 0) {
    await supabaseAdmin.from('presentations')
      .insert(presentations.map(p => ({ tenant_id: auth.tenantId, product_id: product.id, label: p.label, price: p.price })))
  }
  const { data: full } = await supabaseAdmin.from('products')
    .select('*, categories(*), presentations(*)').eq('id', product.id).eq('tenant_id', auth.tenantId).single()
  return res.status(201).json(full)
}

async function productsUpdate(req, res, id) {
  const auth = await requireAdmin(req, res); if (!auth) return
  const { name, category_id, description, active, presentations } = req.body || {}
  const u = {}
  if (name !== undefined) u.name = name
  if (category_id !== undefined) u.category_id = category_id
  if (description !== undefined) u.description = description
  if (active !== undefined) u.active = active
  if (Object.keys(u).length > 0) {
    await supabaseAdmin.from('products').update(u).eq('id', id).eq('tenant_id', auth.tenantId)
  }
  if (presentations) {
    await supabaseAdmin.from('presentations').delete().eq('product_id', id).eq('tenant_id', auth.tenantId)
    if (presentations.length > 0) {
      await supabaseAdmin.from('presentations')
        .insert(presentations.map(p => ({ tenant_id: auth.tenantId, product_id: id, label: p.label, price: p.price })))
    }
  }
  const { data: full } = await supabaseAdmin.from('products')
    .select('*, categories(*), presentations(*)').eq('id', id).eq('tenant_id', auth.tenantId).single()
  return res.status(200).json(full)
}

async function productsDelete(req, res, id) {
  const auth = await requireAdmin(req, res); if (!auth) return
  await supabaseAdmin.from('products').update({ active: false }).eq('id', id).eq('tenant_id', auth.tenantId)
  return res.status(204).end()
}

async function productsBulk(req, res) {
  const auth = await requireAdmin(req, res); if (!auth) return
  const { products } = req.body || {}
  if (!Array.isArray(products) || !products.length) return res.status(400).json({ error: 'Se requiere un arreglo de productos' })
  for (let i = 0; i < products.length; i++) {
    const p = products[i]
    if (!p.name?.trim()) return res.status(400).json({ error: `Fila ${i + 1}: nombre requerido` })
    if (!Array.isArray(p.presentations) || !p.presentations.length) return res.status(400).json({ error: `"${p.name}": requiere presentaciones` })
    for (const pres of p.presentations) {
      if (!pres.label?.trim() || !pres.price || isNaN(pres.price) || pres.price <= 0) return res.status(400).json({ error: `"${p.name}": presentación inválida` })
    }
  }
  const catNames = [...new Set(products.map(p => p.category?.trim()).filter(Boolean))]
  const catMap = {}
  if (catNames.length) {
    const { data: ec } = await supabaseAdmin.from('categories').select('id, name').eq('tenant_id', auth.tenantId)
    const em = {}; (ec || []).forEach(c => { em[c.name.toLowerCase()] = c.id })
    for (const cn of catNames) {
      const k = cn.toLowerCase()
      if (em[k]) { catMap[k] = em[k] } else {
        const { data: nc } = await supabaseAdmin.from('categories')
          .insert({ tenant_id: auth.tenantId, name: cn, active: true }).select('id').single()
        if (nc) { catMap[k] = nc.id; em[k] = nc.id }
      }
    }
  }
  const results = { created: 0, skipped: 0, errors: [] }
  for (const p of products) {
    const cid = p.category?.trim() ? catMap[p.category.trim().toLowerCase()] || null : null
    const { data: ex } = await supabaseAdmin.from('products')
      .select('id').eq('tenant_id', auth.tenantId).ilike('name', p.name.trim()).limit(1)
    if (ex?.length) { results.skipped++; continue }
    const { data: np, error: pe } = await supabaseAdmin.from('products')
      .insert({ tenant_id: auth.tenantId, name: p.name.trim(), category_id: cid, description: p.description?.trim() || null, active: true })
      .select('id').single()
    if (pe) { results.errors.push(`"${p.name}": ${pe.message}`); continue }
    const { error: pre } = await supabaseAdmin.from('presentations')
      .insert(p.presentations.map(pr => ({ tenant_id: auth.tenantId, product_id: np.id, label: pr.label.trim(), price: Number(pr.price), active: true })))
    if (pre) { results.errors.push(`"${p.name}" pres: ${pre.message}`); continue }
    results.created++
  }
  return res.status(200).json({ message: `${results.created} creado(s), ${results.skipped} omitido(s)`, ...results })
}
```

- [ ] **Step 3: SELLERS — reemplazar los 4 handlers**

```js
async function sellersGet(req, res) {
  const auth = await requireAdmin(req, res); if (!auth) return
  const { location_id } = req.query
  let q = supabaseAdmin.from('sellers')
    .select('id, name, pin, role, active, created_at, seller_locations(location_id)')
    .eq('tenant_id', auth.tenantId).order('name')
  if (location_id) {
    q = supabaseAdmin.from('sellers')
      .select('id, name, pin, role, active, created_at, seller_locations!inner(location_id)')
      .eq('tenant_id', auth.tenantId).eq('seller_locations.location_id', location_id).order('name')
  }
  const { data, error } = await q
  if (error) return res.status(500).json({ error: error.message })
  return res.status(200).json(data || [])
}

async function sellersCreate(req, res) {
  const auth = await requireAdmin(req, res); if (!auth) return
  const { name, pin, role = 'seller', location_ids = [] } = req.body || {}
  if (!name || !pin) return res.status(400).json({ error: 'name y pin requeridos' })
  if (!/^\d{4}$/.test(pin)) return res.status(400).json({ error: 'PIN debe ser 4 dígitos' })
  const { data: seller, error: se } = await supabaseAdmin.from('sellers')
    .insert({ tenant_id: auth.tenantId, name, pin, role }).select().single()
  if (se) return res.status(500).json({ error: se.message })
  if (location_ids.length) {
    await supabaseAdmin.from('seller_locations')
      .insert(location_ids.map(lid => ({ tenant_id: auth.tenantId, seller_id: seller.id, location_id: lid })))
  }
  return res.status(201).json(seller)
}

async function sellersUpdate(req, res, id) {
  const auth = await requireAdmin(req, res); if (!auth) return
  const { name, pin, role, active, location_ids } = req.body || {}
  const u = {}
  if (name !== undefined) u.name = name
  if (pin !== undefined) { if (!/^\d{4}$/.test(pin)) return res.status(400).json({ error: 'PIN debe ser 4 dígitos' }); u.pin = pin }
  if (role !== undefined) u.role = role
  if (active !== undefined) u.active = active
  if (Object.keys(u).length) await supabaseAdmin.from('sellers').update(u).eq('id', id).eq('tenant_id', auth.tenantId)
  if (Array.isArray(location_ids)) {
    await supabaseAdmin.from('seller_locations').delete().eq('seller_id', id).eq('tenant_id', auth.tenantId)
    if (location_ids.length) {
      await supabaseAdmin.from('seller_locations')
        .insert(location_ids.map(lid => ({ tenant_id: auth.tenantId, seller_id: id, location_id: lid })))
    }
  }
  const { data } = await supabaseAdmin.from('sellers')
    .select('*, seller_locations(location_id)').eq('id', id).eq('tenant_id', auth.tenantId).single()
  return res.status(200).json(data)
}

async function sellersDelete(req, res, id) {
  const auth = await requireAdmin(req, res); if (!auth) return
  await supabaseAdmin.from('sellers').update({ active: false }).eq('id', id).eq('tenant_id', auth.tenantId)
  return res.status(204).end()
}
```

- [ ] **Step 4: REGISTERS — reemplazar los 4 handlers**

```js
async function registersGet(req, res) {
  const auth = await requireAuth(req, res); if (!auth) return
  const { location_id } = req.query
  let q = supabaseAdmin.from('registers')
    .select('id, name, location_id, active, created_at')
    .eq('tenant_id', auth.tenantId).eq('active', true).order('name')
  if (location_id) q = q.eq('location_id', location_id)
  const { data, error } = await q
  if (error) return res.status(500).json({ error: error.message })
  return res.status(200).json(data || [])
}

async function registersCreate(req, res) {
  const auth = await requireAdmin(req, res); if (!auth) return
  const { name, location_id } = req.body || {}
  if (!name?.trim() || !location_id) return res.status(400).json({ error: 'name y location_id requeridos' })
  const { data, error } = await supabaseAdmin.from('registers')
    .insert({ tenant_id: auth.tenantId, name: name.trim(), location_id, active: true }).select().single()
  if (error) return res.status(500).json({ error: error.message })
  return res.status(201).json(data)
}

async function registersUpdate(req, res, id) {
  const auth = await requireAdmin(req, res); if (!auth) return
  const { name, active } = req.body || {}
  const u = {}
  if (name !== undefined) u.name = name.trim()
  if (active !== undefined) u.active = active
  const { data, error } = await supabaseAdmin.from('registers')
    .update(u).eq('id', id).eq('tenant_id', auth.tenantId).select().single()
  if (error) return res.status(500).json({ error: error.message })
  return res.status(200).json(data)
}

async function registersDelete(req, res, id) {
  const auth = await requireAdmin(req, res); if (!auth) return
  await supabaseAdmin.from('registers').update({ active: false }).eq('id', id).eq('tenant_id', auth.tenantId)
  return res.status(200).json({ ok: true })
}
```

- [ ] **Step 5: INVOICES — reemplazar los 6 handlers**

`invoicesCreate` además valida que `location_id` pertenezca al tenant del token:

```js
async function invoicesCreate(req, res) {
  const auth = await requireAuth(req, res); if (!auth) return
  const { location_id, seller_id, seller_name, location_name, items } = req.body || {}
  if (!location_id || !seller_id || !Array.isArray(items) || !items.length) return res.status(400).json({ error: 'location_id, seller_id e items requeridos' })
  for (const item of items) { if (!item.presentationId || !item.price || !item.qty) return res.status(400).json({ error: 'Item inválido' }) }

  const { data: loc } = await supabaseAdmin.from('locations')
    .select('id').eq('id', location_id).eq('tenant_id', auth.tenantId).single()
  if (!loc) return res.status(403).json({ error: 'Punto de venta no pertenece a esta empresa' })

  const total = items.reduce((s, i) => s + (i.price * i.qty), 0)
  const { data: code, error: ce } = await supabaseAdmin.rpc('get_next_invoice_code', { p_location_id: location_id })
  if (ce || !code) return res.status(500).json({ error: 'No se pudo generar código' })
  const { data: invoice, error: ie } = await supabaseAdmin.from('invoices')
    .insert({ tenant_id: auth.tenantId, code, location_id, location_name, seller_id, seller_name, total, status: 'pending', items })
    .select().single()
  if (ie) return res.status(500).json({ error: ie.message })
  return res.status(201).json(invoice)
}

async function invoicesPending(req, res) {
  const auth = await requireAuth(req, res); if (!auth) return
  const { location_id } = req.query
  if (!location_id) return res.status(400).json({ error: 'location_id requerido' })
  const { data, error } = await supabaseAdmin.from('invoices')
    .select('id, code, total, items, seller_id, seller_name, location_name, created_at, status, observations, edited_at')
    .eq('tenant_id', auth.tenantId).eq('location_id', location_id).eq('status', 'pending')
    .order('created_at', { ascending: false })
  if (error) return res.status(500).json({ error: error.message })
  return res.status(200).json(data || [])
}

async function invoicesGetByCode(req, res, code) {
  const auth = await requireAuth(req, res); if (!auth) return
  const { location_id } = req.query
  if (!location_id) return res.status(400).json({ error: 'location_id requerido' })
  const { data, error } = await supabaseAdmin.from('invoices')
    .select('*').eq('tenant_id', auth.tenantId).eq('code', code).eq('location_id', location_id).eq('status', 'pending')
    .order('created_at', { ascending: false }).limit(1).single()
  if (error && error.code !== 'PGRST116') return res.status(500).json({ error: error.message })
  if (!data) return res.status(404).json({ error: `No hay factura pendiente con código ${code}` })
  return res.status(200).json(data)
}

async function invoicesPay(req, res, code) {
  const auth = await requireAuth(req, res); if (!auth) return
  const { location_id, pay_method, observations, register_id, register_name } = req.body || {}
  if (!location_id || !pay_method) return res.status(400).json({ error: 'location_id y pay_method requeridos' })
  if (!['cash', 'transfer', 'card'].includes(pay_method)) return res.status(400).json({ error: 'pay_method inválido' })
  const { data, error } = await supabaseAdmin.from('invoices').update({
    status: 'paid', pay_method, paid_at: new Date().toISOString(),
    cashier_id: auth.seller.id, cashier_name: auth.seller.name,
    ...(register_id ? { register_id } : {}), ...(register_name ? { register_name } : {}),
    ...(observations ? { observations } : {}),
  }).eq('tenant_id', auth.tenantId).eq('code', code).eq('location_id', location_id).eq('status', 'pending').select().single()
  if (error) return res.status(500).json({ error: error.message })
  if (!data) return res.status(409).json({ error: 'Factura no existe, ya cobrada o cancelada' })
  return res.status(200).json(data)
}

async function invoicesCancel(req, res, code) {
  const auth = await requireAuth(req, res); if (!auth) return
  const { location_id } = req.body || {}
  if (!location_id) return res.status(400).json({ error: 'location_id requerido' })
  const { data, error } = await supabaseAdmin.from('invoices')
    .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
    .eq('tenant_id', auth.tenantId).eq('code', code).eq('location_id', location_id).eq('status', 'pending').select().single()
  if (error) return res.status(500).json({ error: error.message })
  if (!data) return res.status(409).json({ error: 'Factura no existe, ya cobrada o cancelada' })
  return res.status(200).json(data)
}

async function invoicesEdit(req, res, code) {
  const auth = await requireAuth(req, res); if (!auth) return
  if (!['cashier', 'admin'].includes(auth.seller.role)) return res.status(403).json({ error: 'Solo cajero o admin pueden editar' })
  const { location_id, items, observations } = req.body || {}
  if (!location_id) return res.status(400).json({ error: 'location_id requerido' })
  const { data: existing } = await supabaseAdmin.from('invoices')
    .select('id').eq('tenant_id', auth.tenantId).eq('code', code).eq('location_id', location_id).eq('status', 'pending').single()
  if (!existing) return res.status(404).json({ error: 'Factura pendiente no encontrada' })
  const u = { edited_by: auth.seller.id, edited_at: new Date().toISOString() }
  if (items !== undefined) {
    if (!Array.isArray(items) || !items.length) return res.status(400).json({ error: 'items vacío' })
    const pi = items.map(i => ({ ...i, subtotal: i.price * i.qty }))
    u.items = pi; u.total = pi.reduce((s, i) => s + i.subtotal, 0)
  }
  if (observations !== undefined) u.observations = observations || null
  const { data, error } = await supabaseAdmin.from('invoices')
    .update(u).eq('id', existing.id).eq('status', 'pending').select().single()
  if (error) return res.status(500).json({ error: error.message })
  return res.status(200).json(data)
}

async function invoicesHistory(req, res) {
  const auth = await requireAuth(req, res); if (!auth) return
  const { location_id, date, status, seller_id, limit = '50', offset = '0' } = req.query
  const day = date ? new Date(date) : new Date(); day.setHours(0,0,0,0)
  const dayEnd = new Date(day); dayEnd.setDate(dayEnd.getDate() + 1)
  let q = supabaseAdmin.from('invoices')
    .select('id, code, location_id, location_name, seller_id, seller_name, total, status, pay_method, items, observations, edited_at, edited_by, register_name, cashier_name, created_at, paid_at', { count: 'exact' })
    .eq('tenant_id', auth.tenantId)
    .gte('created_at', day.toISOString()).lt('created_at', dayEnd.toISOString()).order('created_at', { ascending: false })
    .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1)
  if (location_id) q = q.eq('location_id', location_id)
  if (status) q = q.eq('status', status)
  if (seller_id) q = q.eq('seller_id', seller_id)
  const { data, error, count } = await q
  if (error) return res.status(500).json({ error: error.message })
  return res.status(200).json({ invoices: data || [], total: count || 0 })
}
```

- [ ] **Step 6: REPORTS — agregar auth y filtro a los 6 handlers**

Cada uno inicia con `const auth = await requireAuth(req, res); if (!auth) return`, y cada query a `invoices`, `locations` o `sellers` agrega `.eq('tenant_id', auth.tenantId)`. Cambios exactos:

- `reportDaily`: agregar auth al inicio; en el query de invoices agregar `.eq('tenant_id', auth.tenantId)` justo después de `.from('invoices').select(...)`.
- `reportSellers`: igual (auth + `.eq('tenant_id', auth.tenantId)` en invoices).
- `reportLocations`: auth; agregar `.eq('tenant_id', auth.tenantId)` al query de `locations` Y al de `invoices`.
- `reportRegisters`: auth + `.eq('tenant_id', auth.tenantId)` en invoices.
- `reportSellerDetail`: auth; agregar `.eq('tenant_id', auth.tenantId)` al query de `sellers` Y al de `invoices`.
- `reportTopProducts`: auth + `.eq('tenant_id', auth.tenantId)` en invoices.

Ejemplo (reportDaily, primeras líneas):

```js
async function reportDaily(req, res) {
  const auth = await requireAuth(req, res); if (!auth) return
  const { location_id, date } = req.query
  const day = date ? new Date(date) : new Date(); day.setHours(0,0,0,0)
  const dayEnd = new Date(day); dayEnd.setDate(dayEnd.getDate() + 1)
  let q = supabaseAdmin.from('invoices')
    .select('id, total, pay_method, status, seller_id, seller_name, location_id, location_name, items, created_at')
    .eq('tenant_id', auth.tenantId)
    .gte('created_at', day.toISOString()).lt('created_at', dayEnd.toISOString())
  // ... resto sin cambios
```

- [ ] **Step 7: Auditoría final del archivo**

Run: `grep -n "from('invoices')\|from('products')\|from('sellers')\|from('locations')\|from('registers')\|from('categories')\|from('presentations')\|from('stock')\|from('seller_locations')" "api/[[...path]].js"`
Expected: cada línea listada debe tener (en esa línea o las 2 siguientes) un `.eq('tenant_id'` o un `tenant_id:` en el insert — EXCEPTO en `authLogin` y `publicTenantGet`, que resuelven el tenant por slug. Revisar cada match manualmente.

- [ ] **Step 8: Verificar build y commit**

```bash
npm test && npm run build
git add "api/[[...path]].js"
git commit -m "feat(api): scoping por tenant_id en todas las rutas existentes"
```

---

### Task 6: Rutas super admin

**Files:**
- Create: `api/_lib/superRoutes.js`
- Modify: `api/[[...path]].js` (import + rutas en el router)

**Interfaces:**
- Consumes: `requireSuperAdmin` (auth.js), `signToken` (jwt.js), `getTenantStatus` (tenantStatus.js), `slugify` (slug.js), `supabaseAdmin`, `bcryptjs`.
- Produces:
  - `POST /api/auth/super/login` body `{ email, password }` → `{ token, email }`
  - `GET /api/super/tenants` → `[{ ...tenant, today_sales, today_invoices, last_activity, status: 'active'|<code> }]`
  - `POST /api/super/tenants` body `{ name, slug?, license_start, license_end, admin?: { name, pin } }` → `201 { tenant, link: '/c/<slug>' }`
  - `PATCH /api/super/tenants/:id` body `{ name?, active?, license_start?, license_end? }` → tenant actualizado
  - `POST /api/super/tenants/:id/admin` body `{ name, pin }` → seller admin creado
  - `GET /api/super/metrics?from=YYYY-MM-DD&to=YYYY-MM-DD` → `[{ tenant_id, tenant_name, revenue, invoice_count }]`

- [ ] **Step 1: Crear `api/_lib/superRoutes.js` completo**

```js
import bcrypt from 'bcryptjs'
import { supabaseAdmin } from './supabaseAdmin.js'
import { requireSuperAdmin } from './auth.js'
import { signToken } from './jwt.js'
import { getTenantStatus } from './tenantStatus.js'
import { slugify } from './slug.js'

// =====================================================
// PyroVenta — Rutas del super admin (plataforma)
// =====================================================

export async function superLogin(req, res) {
  const { email, password } = req.body || {}
  if (!email || !password) return res.status(400).json({ error: 'Email y contraseña requeridos' })

  const { data: sa } = await supabaseAdmin
    .from('super_admins').select('id, email, password_hash')
    .eq('email', String(email).toLowerCase().trim()).single()

  if (!sa || !bcrypt.compareSync(password, sa.password_hash)) {
    return res.status(401).json({ error: 'Credenciales inválidas' })
  }

  const token = await signToken({ role: 'super_admin', superAdminId: sa.id }, '24h')
  return res.status(200).json({ token, email: sa.email })
}

export async function superTenantsList(req, res) {
  const auth = await requireSuperAdmin(req, res); if (!auth) return

  const { data: tenants, error } = await supabaseAdmin
    .from('tenants').select('*').order('created_at', { ascending: false })
  if (error) return res.status(500).json({ error: error.message })

  const today = new Date(); today.setHours(0, 0, 0, 0)
  const [{ data: todayInvoices }, { data: lastActivity }] = await Promise.all([
    supabaseAdmin.from('invoices').select('tenant_id, total, status').gte('created_at', today.toISOString()),
    supabaseAdmin.rpc('tenant_last_activity'),
  ])

  const sales = {}
  ;(todayInvoices || []).forEach(i => {
    if (i.status !== 'paid') return
    if (!sales[i.tenant_id]) sales[i.tenant_id] = { total: 0, count: 0 }
    sales[i.tenant_id].total += i.total || 0
    sales[i.tenant_id].count++
  })
  const last = {}
  ;(lastActivity || []).forEach(r => { last[r.tenant_id] = r.last_invoice_at })

  return res.status(200).json((tenants || []).map(t => {
    const st = getTenantStatus(t)
    return {
      ...t,
      today_sales:    sales[t.id]?.total || 0,
      today_invoices: sales[t.id]?.count || 0,
      last_activity:  last[t.id] || null,
      status:         st.ok ? 'active' : st.code,
    }
  }))
}

export async function superTenantsCreate(req, res) {
  const auth = await requireSuperAdmin(req, res); if (!auth) return
  const { name, slug: rawSlug, license_start, license_end, admin } = req.body || {}
  if (!name?.trim()) return res.status(400).json({ error: 'El nombre es requerido' })
  if (!license_start || !license_end) return res.status(400).json({ error: 'license_start y license_end son requeridos' })
  if (license_end < license_start) return res.status(400).json({ error: 'license_end debe ser posterior a license_start' })
  if (admin && (!admin.name?.trim() || !/^\d{4}$/.test(admin.pin || ''))) {
    return res.status(400).json({ error: 'El admin inicial requiere nombre y PIN de 4 dígitos' })
  }

  const slug = slugify(rawSlug || name)
  if (!slug) return res.status(400).json({ error: 'No se pudo generar un slug válido' })

  const { data: tenant, error } = await supabaseAdmin
    .from('tenants')
    .insert({ name: name.trim(), slug, active: true, license_start, license_end })
    .select().single()
  if (error) {
    if (error.code === '23505') return res.status(409).json({ error: `El código "${slug}" ya existe — usa otro` })
    return res.status(500).json({ error: error.message })
  }

  if (admin) {
    const { error: se } = await supabaseAdmin.from('sellers')
      .insert({ tenant_id: tenant.id, name: admin.name.trim(), pin: admin.pin, role: 'admin' })
    if (se) return res.status(500).json({ error: `Tenant creado pero falló el admin: ${se.message}` })
  }

  return res.status(201).json({ tenant, link: `/c/${slug}` })
}

export async function superTenantsPatch(req, res, id) {
  const auth = await requireSuperAdmin(req, res); if (!auth) return
  const { name, active, license_start, license_end } = req.body || {}
  const u = {}
  if (name !== undefined)          u.name = name
  if (active !== undefined)        u.active = active
  if (license_start !== undefined) u.license_start = license_start
  if (license_end !== undefined)   u.license_end = license_end
  if (!Object.keys(u).length) return res.status(400).json({ error: 'Nada que actualizar' })
  const { data, error } = await supabaseAdmin.from('tenants').update(u).eq('id', id).select().single()
  if (error) return res.status(500).json({ error: error.message })
  return res.status(200).json(data)
}

export async function superTenantAdminCreate(req, res, tenantId) {
  const auth = await requireSuperAdmin(req, res); if (!auth) return
  const { name, pin } = req.body || {}
  if (!name?.trim() || !/^\d{4}$/.test(pin || '')) {
    return res.status(400).json({ error: 'Nombre y PIN de 4 dígitos requeridos' })
  }
  const { data: tenant } = await supabaseAdmin.from('tenants').select('id').eq('id', tenantId).single()
  if (!tenant) return res.status(404).json({ error: 'Empresa no encontrada' })
  const { data, error } = await supabaseAdmin.from('sellers')
    .insert({ tenant_id: tenantId, name: name.trim(), pin, role: 'admin' })
    .select('id, name, role').single()
  if (error) return res.status(500).json({ error: error.message })
  return res.status(201).json(data)
}

export async function superMetrics(req, res) {
  const auth = await requireSuperAdmin(req, res); if (!auth) return
  const { from, to } = req.query
  const start = from ? new Date(from) : new Date(); start.setHours(0, 0, 0, 0)
  const end = to ? new Date(to) : new Date(start); end.setHours(0, 0, 0, 0)
  end.setDate(end.getDate() + 1)

  const [{ data: tenants }, { data: invoices, error }] = await Promise.all([
    supabaseAdmin.from('tenants').select('id, name'),
    supabaseAdmin.from('invoices').select('tenant_id, total, status')
      .gte('created_at', start.toISOString()).lt('created_at', end.toISOString()).eq('status', 'paid'),
  ])
  if (error) return res.status(500).json({ error: error.message })

  const m = {}
  ;(invoices || []).forEach(i => {
    if (!m[i.tenant_id]) m[i.tenant_id] = { revenue: 0, invoice_count: 0 }
    m[i.tenant_id].revenue += i.total || 0
    m[i.tenant_id].invoice_count++
  })
  return res.status(200).json((tenants || []).map(t => ({
    tenant_id: t.id,
    tenant_name: t.name,
    revenue: m[t.id]?.revenue || 0,
    invoice_count: m[t.id]?.invoice_count || 0,
  })).sort((a, b) => b.revenue - a.revenue))
}
```

- [ ] **Step 2: Registrar rutas en el catch-all**

En `api/[[...path]].js`, agregar al bloque de imports:

```js
import { superLogin, superTenantsList, superTenantsCreate, superTenantsPatch, superTenantAdminCreate, superMetrics } from './_lib/superRoutes.js'
```

En el router, después del bloque de `/public/tenant`:

```js
  // ---- SUPER ADMIN ----------------------------------
  if (route === '/auth/super/login' && method === 'POST') return superLogin(req, res)
  if (route === '/super/tenants' && method === 'GET')     return superTenantsList(req, res)
  if (route === '/super/tenants' && method === 'POST')    return superTenantsCreate(req, res)
  if (segments[0] === 'super' && segments[1] === 'tenants' && segments[2] && !segments[3] && method === 'PATCH') {
    return superTenantsPatch(req, res, segments[2])
  }
  if (segments[0] === 'super' && segments[1] === 'tenants' && segments[2] && segments[3] === 'admin' && method === 'POST') {
    return superTenantAdminCreate(req, res, segments[2])
  }
  if (route === '/super/metrics' && method === 'GET')     return superMetrics(req, res)
```

Además, en `api/_lib/cors.js` agregar `PATCH` a los métodos permitidos:

```js
res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS')
```

- [ ] **Step 3: Verificar y commit**

```bash
npm test && npm run build
git add api/_lib/superRoutes.js "api/[[...path]].js" api/_lib/cors.js
git commit -m "feat(api): rutas super admin (login, tenants CRUD, admin inicial, metricas)"
```

---

### Task 7: Frontend base — authStore, api.js y entrada por slug

**Files:**
- Modify: `src/store/authStore.js`
- Modify: `src/lib/api.js`
- Create: `src/pages/TenantEntry.jsx`
- Modify: `src/App.jsx` (ruta `/c/:slug`)

**Interfaces:**
- Produces: `useAuthStore` con `tenant: {id,name,slug} | null` y `login(seller, location, tenant, token)` (firma NUEVA de 4 args — LoginPage se actualiza en Task 8).
- Produces: clave localStorage `pv_tenant_slug`.
- Produces: `api.js` adjunta `err.code` en errores HTTP y emite `window.dispatchEvent(new CustomEvent('pv:license-error', { detail: { code, message } }))` en 403 de licencia.
- Produces: ruta `/c/:slug` → guarda slug y redirige a `/login`.

- [ ] **Step 1: Actualizar `src/store/authStore.js`**

Reemplazar el contenido del `create(persist(...))` — cambios: campo `tenant`, `login` de 4 args, `logout` conserva el slug (el dispositivo sigue amarrado a la empresa):

```js
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export const useAuthStore = create(
  persist(
    (set, get) => ({
      seller:   null,   // { id, name, role }
      location: null,   // { id, name, address, printer_config }
      tenant:   null,   // { id, name, slug }
      register: null,   // { id, name } — caja seleccionada (solo cajeros)
      token:    null,

      isAuthenticated: () => !!get().seller,

      hasRole: (...roles) => {
        const s = get().seller
        return s && roles.includes(s.role)
      },

      login: (seller, location, tenant, token) => {
        localStorage.setItem('pv_token', token)
        if (tenant?.slug) localStorage.setItem('pv_tenant_slug', tenant.slug)
        set({ seller, location, tenant, token, register: null })
      },

      setRegister: (register) => set({ register }),

      logout: () => {
        localStorage.removeItem('pv_token')
        // pv_tenant_slug se conserva: el dispositivo sigue amarrado a la empresa
        set({ seller: null, location: null, register: null, token: null })
      },

      updatePrinterConfig: (printerConfig) =>
        set(state => ({
          location: state.location
            ? { ...state.location, printer_config: printerConfig }
            : state.location
        })),
    }),
    {
      name: 'pv_auth',
      partialize: (state) => ({
        seller:   state.seller,
        location: state.location,
        tenant:   state.tenant,
        register: state.register,
        token:    state.token,
      }),
      onRehydrateStorage: () => (state) => {
        if (state?.token) {
          localStorage.setItem('pv_token', state.token)
        }
      },
    }
  )
)
```

- [ ] **Step 2: Actualizar `src/lib/api.js` — propagar `code` y evento de licencia**

Reemplazar el bloque `if (!res.ok) { ... }` (líneas 33-45 actuales) por:

```js
      if (!res.ok) {
        let message = `Error HTTP ${res.status}`
        let code = null
        try {
          const data = await res.json()
          message = data.error || data.message || message
          code = data.code || null
        } catch { /* ignore parse errors */ }
        const err = new Error(message)
        err.status = res.status
        err.code = code
        // Licencia vencida / empresa suspendida → evento global para bloquear la app
        if (res.status === 403 && ['LICENSE_EXPIRED', 'TENANT_SUSPENDED', 'LICENSE_NOT_STARTED'].includes(code)) {
          window.dispatchEvent(new CustomEvent('pv:license-error', { detail: { code, message } }))
        }
        // No reintentar errores de cliente (4xx) excepto 408/429
        if (res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429) {
          throw err
        }
        lastError = err
      } else {
```

- [ ] **Step 3: Crear `src/pages/TenantEntry.jsx`**

```jsx
import { useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'

// Captura /c/:slug → amarra el dispositivo a la empresa y va al login
export default function TenantEntry() {
  const { slug } = useParams()
  const navigate = useNavigate()

  useEffect(() => {
    if (slug) localStorage.setItem('pv_tenant_slug', slug.toLowerCase())
    navigate('/login', { replace: true })
  }, [slug, navigate])

  return null
}
```

- [ ] **Step 4: Agregar la ruta en `src/App.jsx`**

Import: `import TenantEntry from './pages/TenantEntry.jsx'`
Dentro de `<Routes>`, antes de `/login`:

```jsx
        <Route path="/c/:slug" element={<TenantEntry />} />
```

- [ ] **Step 5: Verificar build y commit**

```bash
npm run build
git add src/store/authStore.js src/lib/api.js src/pages/TenantEntry.jsx src/App.jsx
git commit -m "feat(front): tenant en authStore, entrada /c/:slug y errores de licencia en api client"
```

Nota: en este punto LoginPage aún llama `login()` con 3 args — se corrige en Task 8 (mismo PR/rama, sin deploy intermedio).

---

### Task 8: LoginPage multitenant

**Files:**
- Modify: `src/pages/LoginPage.jsx`
- Modify: `src/components/LocationSelector.jsx`

**Interfaces:**
- Consumes: `GET /api/public/tenant/:slug`, `POST /api/auth/login` con `tenant_slug`, `login(seller, location, tenant, token)`.
- Produces: `LocationSelector` ahora recibe `locations` por prop (ya no hace fetch propio).

- [ ] **Step 1: Simplificar `src/components/LocationSelector.jsx`**

Reemplazar el archivo completo — recibe la lista por prop:

```jsx
import { CheckCircle2, MapPin } from 'lucide-react'

export default function LocationSelector({ locations = [], value, onChange }) {
  if (locations.length === 0) {
    return (
      <p className="text-gray-500 text-sm text-center py-6">
        Esta empresa aún no tiene puntos de venta configurados.
      </p>
    )
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {locations.map(loc => (
        <button
          key={loc.id}
          onClick={() => onChange(loc)}
          className={`
            text-left p-4 rounded-xl border-2 transition-all duration-150 cursor-pointer
            ${value?.id === loc.id
              ? 'bg-brand-500/20 border-brand-500 text-white'
              : 'bg-surface-300 border-white/10 text-gray-300 hover:border-brand-500/50 hover:bg-surface-200'
            }
          `}
        >
          <div className="flex items-start gap-3">
            <MapPin className="w-5 h-5 mt-0.5 text-brand-500" />
            <div className="min-w-0">
              <p className="font-semibold text-white truncate">{loc.name}</p>
              {loc.address && (
                <p className="text-xs text-gray-500 mt-0.5 truncate">{loc.address}</p>
              )}
            </div>
            {value?.id === loc.id && (
              <CheckCircle2 className="ml-auto text-brand-500 w-5 h-5 shrink-0" />
            )}
          </div>
        </button>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Actualizar `src/pages/LoginPage.jsx`**

Cambios sobre el archivo existente (NumPad y RegisterSelector quedan igual):

1. Nuevo estado y bootstrap del tenant. Reemplazar el bloque de estados del componente `LoginPage` por:

```jsx
  const [step,         setStep]         = useState('company') // 'company' | 'location' | 'pin' | 'register'
  const [slugInput,    setSlugInput]    = useState('')
  const [tenant,       setTenant]      = useState(null)      // { id, name, slug }
  const [locations,    setLocations]   = useState([])
  const [bootLoading,  setBootLoading] = useState(true)
  const [location,     setLocation]     = useState(null)
  const [pin,          setPin]          = useState('')
  const [loading,      setLoading]      = useState(false)
  const [loginData,    setLoginData]    = useState(null)
  const [selectedReg,  setSelectedReg]  = useState(null)
```

2. Agregar después de los estados:

```jsx
  const loadTenant = async (slug) => {
    setBootLoading(true)
    try {
      const data = await api.get(`/public/tenant/${encodeURIComponent(slug)}`)
      setTenant(data.tenant)
      setLocations(data.locations || [])
      localStorage.setItem('pv_tenant_slug', data.tenant.slug)
      setStep('location')
    } catch (err) {
      localStorage.removeItem('pv_tenant_slug')
      setTenant(null)
      setStep('company')
      if (err.status) toastError(err.message)
    } finally {
      setBootLoading(false)
    }
  }

  useEffect(() => {
    const saved = localStorage.getItem('pv_tenant_slug')
    if (saved) loadTenant(saved)
    else setBootLoading(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleCompanySubmit = (e) => {
    e.preventDefault()
    const slug = slugInput.trim().toLowerCase()
    if (slug) loadTenant(slug)
  }

  const handleChangeCompany = () => {
    localStorage.removeItem('pv_tenant_slug')
    setTenant(null); setLocation(null); setSlugInput('')
    setStep('company')
  }
```

(Agregar `useEffect` al import de react si no está: ya está importado.)

3. En `handleLogin`, reemplazar las dos líneas del POST y login por:

```jsx
      const data = await api.post('/auth/login', { pin: p, location_id: location.id, tenant_slug: tenant.slug })
      login(data.seller, data.location, data.tenant, data.token)
```

4. En el JSX, bajo el logo, mostrar la empresa activa. Reemplazar el `<p className="text-gray-500 text-sm mt-1">Sistema de control de ventas</p>` por:

```jsx
          <p className="text-gray-500 text-sm mt-1">
            {tenant ? tenant.name : 'Sistema de control de ventas'}
          </p>
```

5. Dentro del card principal, ANTES del bloque `{step === 'location' && (...)}`, agregar el paso de empresa y el loading:

```jsx
          {bootLoading && (
            <div className="py-10 text-center">
              <Loader2 className="animate-spin h-6 w-6 text-brand-500 mx-auto" />
              <p className="text-gray-500 text-sm mt-3">Cargando empresa...</p>
            </div>
          )}

          {!bootLoading && step === 'company' && (
            <form onSubmit={handleCompanySubmit} className="animate-fade-in">
              <h2 className="font-syne text-lg font-semibold text-white mb-1">
                Código de empresa
              </h2>
              <p className="text-gray-500 text-sm mb-4">
                Ingresa el código que te entregó tu proveedor (o abre el link de tu empresa).
              </p>
              <input
                type="text"
                value={slugInput}
                onChange={e => setSlugInput(e.target.value)}
                placeholder="ej: pirotecnia-el-coheton"
                autoFocus
                className="w-full px-4 py-3 rounded-xl bg-surface-400 border-2 border-white/10 text-white placeholder-gray-600 focus:border-brand-500 focus:outline-none"
              />
              <button
                type="submit"
                disabled={!slugInput.trim()}
                className="btn btn-primary btn-lg w-full mt-5"
              >
                Continuar
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          )}
```

6. Envolver los pasos existentes con la condición de no-loading: cambiar `{step === 'location' && (` por `{!bootLoading && step === 'location' && (`, y lo mismo para `'pin'` y `'register'`.

7. En el paso `location`, pasar las locations por prop y agregar link de cambio de empresa. Reemplazar `<LocationSelector value={location} onChange={setLocation} />` por:

```jsx
              <LocationSelector locations={locations} value={location} onChange={setLocation} />

              <button
                type="button"
                onClick={handleChangeCompany}
                className="text-xs text-gray-600 hover:text-gray-400 transition-colors mt-3 w-full text-center"
              >
                Cambiar de empresa
              </button>
```

8. Eliminar la línea del footer `PyroVenta v0.1 · Admin PIN: 0000` y dejar:

```jsx
        <p className="text-center text-gray-700 text-xs mt-4">
          PyroVenta · Multitenant
        </p>
```

- [ ] **Step 3: Verificar build**

Run: `npm run build`
Expected: OK, sin warnings de imports sin usar (quitar `RotateCcw`/`useEffect... ` sobrantes si Vite/ESLint reporta).

- [ ] **Step 4: Prueba manual en dev** (frontend solo; la API real se prueba en Task 11)

Run: `npm run dev` y abrir `http://localhost:5173/login`
Expected: aparece el paso "Código de empresa". Abrir `http://localhost:5173/c/demo` → guarda `pv_tenant_slug=demo` en localStorage y redirige a `/login` (el fetch a `/api/public/tenant/demo` fallará sin backend — mostrará el paso company de nuevo; es el comportamiento esperado sin API).

- [ ] **Step 5: Commit**

```bash
git add src/pages/LoginPage.jsx src/components/LocationSelector.jsx
git commit -m "feat(front): login multitenant con codigo de empresa y bootstrap por slug"
```

---

### Task 9: Bloqueo por licencia vencida/suspendida

**Files:**
- Create: `src/components/LicenseBlock.jsx`
- Modify: `src/App.jsx`

**Interfaces:**
- Consumes: evento `pv:license-error` (`detail: { code, message }`) emitido por `src/lib/api.js`.
- Produces: overlay bloqueante a pantalla completa con botón "Cerrar sesión".

- [ ] **Step 1: Crear `src/components/LicenseBlock.jsx`**

```jsx
import { useEffect, useState } from 'react'
import { ShieldAlert } from 'lucide-react'
import { useAuthStore } from '../store/authStore.js'

// Overlay bloqueante cuando la API responde 403 de licencia/suspensión
export default function LicenseBlock() {
  const [error, setError] = useState(null) // { code, message }
  const logout = useAuthStore(s => s.logout)

  useEffect(() => {
    const handler = (e) => setError(e.detail)
    window.addEventListener('pv:license-error', handler)
    return () => window.removeEventListener('pv:license-error', handler)
  }, [])

  if (!error) return null

  const handleLogout = () => {
    logout()
    setError(null)
    window.location.href = '/login'
  }

  return (
    <div className="fixed inset-0 z-[1200] bg-black/90 backdrop-blur flex items-center justify-center p-6">
      <div className="card bg-surface-300 border-red-500/30 p-8 max-w-md text-center">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-red-500/15 border border-red-500/30 mb-4">
          <ShieldAlert className="w-7 h-7 text-red-400" />
        </div>
        <h2 className="font-syne text-xl font-bold text-white mb-2">Acceso suspendido</h2>
        <p className="text-gray-400 text-sm mb-6">{error.message}</p>
        <button onClick={handleLogout} className="btn btn-primary w-full">
          Cerrar sesión
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Montar en `src/App.jsx`**

Import: `import LicenseBlock from './components/LicenseBlock.jsx'`
Dentro de `<ToastProvider>`, junto a `<NetworkBanner />`:

```jsx
      <LicenseBlock />
```

- [ ] **Step 3: Verificar build, prueba manual y commit**

Run: `npm run build`, luego `npm run dev`, abrir la app y en la consola del navegador ejecutar:
`window.dispatchEvent(new CustomEvent('pv:license-error', { detail: { code: 'LICENSE_EXPIRED', message: 'Licencia vencida. Contacte a su proveedor.' } }))`
Expected: aparece el overlay bloqueante con el mensaje y botón de cerrar sesión.

```bash
git add src/components/LicenseBlock.jsx src/App.jsx
git commit -m "feat(front): overlay bloqueante por licencia vencida o empresa suspendida"
```

---

### Task 10: Panel super admin

**Files:**
- Create: `src/lib/superApi.js`
- Create: `src/pages/SuperLoginPage.jsx`
- Create: `src/pages/SuperDashboard.jsx`
- Modify: `src/App.jsx` (rutas `/super/login` y `/super`)

**Interfaces:**
- Consumes: rutas `/api/auth/super/login`, `/api/super/*` (Task 6). Token en localStorage `pv_super_token`.
- Produces: `superApi.get/post/patch(path, body?)` → Promise (lanza `Error` con `.message`; en 401 limpia token y redirige a `/super/login`).

- [ ] **Step 1: Crear `src/lib/superApi.js`**

```js
// Cliente HTTP del panel super admin (token separado del POS)
const BASE = '/api'

async function request(method, path, body) {
  const token = localStorage.getItem('pv_super_token')
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })

  if (res.status === 401 && !path.startsWith('/auth/')) {
    localStorage.removeItem('pv_super_token')
    window.location.href = '/super/login'
    throw new Error('Sesión expirada')
  }

  const data = res.status === 204 ? null : await res.json().catch(() => null)
  if (!res.ok) throw new Error(data?.error || `Error HTTP ${res.status}`)
  return data
}

export const superApi = {
  get:   (path)       => request('GET', path),
  post:  (path, body) => request('POST', path, body),
  patch: (path, body) => request('PATCH', path, body),
}
```

- [ ] **Step 2: Crear `src/pages/SuperLoginPage.jsx`**

```jsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Loader2, Lock } from 'lucide-react'
import { superApi } from '../lib/superApi.js'

export default function SuperLoginPage() {
  const navigate = useNavigate()
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState(null)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true); setError(null)
    try {
      const data = await superApi.post('/auth/super/login', { email, password })
      localStorage.setItem('pv_super_token', data.token)
      navigate('/super')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#0d0d0d] flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-brand-500/15 border border-brand-500/30 mb-3">
            <Lock className="w-8 h-8 text-brand-500" />
          </div>
          <h1 className="font-syne text-2xl font-bold text-white">PyroVenta</h1>
          <p className="text-gray-500 text-sm mt-1">Panel de plataforma</p>
        </div>

        <form onSubmit={handleSubmit} className="card bg-surface-300 border-white/8 p-6 space-y-4">
          <div>
            <label className="text-gray-400 text-sm block mb-1.5">Email</label>
            <input
              type="email" value={email} onChange={e => setEmail(e.target.value)} required autoFocus
              className="w-full px-4 py-2.5 rounded-xl bg-surface-400 border-2 border-white/10 text-white focus:border-brand-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="text-gray-400 text-sm block mb-1.5">Contraseña</label>
            <input
              type="password" value={password} onChange={e => setPassword(e.target.value)} required
              className="w-full px-4 py-2.5 rounded-xl bg-surface-400 border-2 border-white/10 text-white focus:border-brand-500 focus:outline-none"
            />
          </div>
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <button type="submit" disabled={loading} className="btn btn-primary btn-lg w-full">
            {loading ? <Loader2 className="animate-spin h-4 w-4" /> : 'Ingresar'}
          </button>
        </form>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Crear `src/pages/SuperDashboard.jsx`**

```jsx
import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Building2, Copy, Loader2, LogOut, Pause, Play, Plus, RefreshCw } from 'lucide-react'
import { superApi } from '../lib/superApi.js'
import { formatCOP } from '../lib/format.js'

const STATUS_LABEL = {
  active:              { text: 'Activo',        cls: 'bg-green-500/15 text-green-400 border-green-500/30' },
  TENANT_SUSPENDED:    { text: 'Suspendido',    cls: 'bg-red-500/15 text-red-400 border-red-500/30' },
  LICENSE_EXPIRED:     { text: 'Vencido',       cls: 'bg-amber-500/15 text-amber-400 border-amber-500/30' },
  LICENSE_NOT_STARTED: { text: 'No iniciado',   cls: 'bg-gray-500/15 text-gray-400 border-gray-500/30' },
}

function StatusChip({ status }) {
  const s = STATUS_LABEL[status] || STATUS_LABEL.active
  return <span className={`text-xs px-2 py-0.5 rounded-full border ${s.cls}`}>{s.text}</span>
}

// ---- Wizard de nuevo cliente -----------------------------
function NewTenantModal({ onClose, onCreated }) {
  const [name,   setName]   = useState('')
  const [start,  setStart]  = useState('')
  const [end,    setEnd]    = useState('')
  const [adminName, setAdminName] = useState('')
  const [adminPin,  setAdminPin]  = useState('')
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)
  const [created, setCreated] = useState(null) // { tenant, link }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true); setError(null)
    try {
      const body = { name, license_start: start, license_end: end }
      if (adminName.trim()) body.admin = { name: adminName.trim(), pin: adminPin }
      const data = await superApi.post('/super/tenants', body)
      setCreated(data)
      onCreated()
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const fullLink = created ? `${window.location.origin}${created.link}` : ''

  return (
    <div className="fixed inset-0 z-[1100] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="card bg-surface-300 border-white/10 p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
        {!created ? (
          <form onSubmit={handleSubmit} className="space-y-4">
            <h2 className="font-syne text-lg font-bold text-white">Nuevo cliente</h2>
            <div>
              <label className="text-gray-400 text-sm block mb-1.5">Nombre de la empresa</label>
              <input value={name} onChange={e => setName(e.target.value)} required autoFocus
                placeholder="Pirotecnia El Cohetón"
                className="w-full px-4 py-2.5 rounded-xl bg-surface-400 border-2 border-white/10 text-white focus:border-brand-500 focus:outline-none" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-gray-400 text-sm block mb-1.5">Inicio licencia</label>
                <input type="date" value={start} onChange={e => setStart(e.target.value)} required
                  className="w-full px-3 py-2.5 rounded-xl bg-surface-400 border-2 border-white/10 text-white focus:border-brand-500 focus:outline-none" />
              </div>
              <div>
                <label className="text-gray-400 text-sm block mb-1.5">Fin licencia</label>
                <input type="date" value={end} onChange={e => setEnd(e.target.value)} required
                  className="w-full px-3 py-2.5 rounded-xl bg-surface-400 border-2 border-white/10 text-white focus:border-brand-500 focus:outline-none" />
              </div>
            </div>
            <div className="border-t border-white/10 pt-4">
              <p className="text-gray-400 text-sm mb-3">Primer administrador (opcional)</p>
              <div className="grid grid-cols-2 gap-3">
                <input value={adminName} onChange={e => setAdminName(e.target.value)} placeholder="Nombre"
                  className="w-full px-3 py-2.5 rounded-xl bg-surface-400 border-2 border-white/10 text-white focus:border-brand-500 focus:outline-none" />
                <input value={adminPin} onChange={e => setAdminPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  placeholder="PIN (4 dígitos)" inputMode="numeric"
                  className="w-full px-3 py-2.5 rounded-xl bg-surface-400 border-2 border-white/10 text-white focus:border-brand-500 focus:outline-none" />
              </div>
            </div>
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <div className="flex gap-2">
              <button type="button" onClick={onClose} className="btn btn-ghost flex-1">Cancelar</button>
              <button type="submit" disabled={loading || (adminName.trim() !== '' && adminPin.length !== 4)}
                className="btn btn-primary flex-1">
                {loading ? <Loader2 className="animate-spin h-4 w-4" /> : 'Crear'}
              </button>
            </div>
          </form>
        ) : (
          <div className="text-center space-y-4">
            <h2 className="font-syne text-lg font-bold text-white">¡Cliente creado!</h2>
            <p className="text-gray-400 text-sm">Comparte este link con tu cliente — sus dispositivos quedarán amarrados a su empresa:</p>
            <div className="flex items-center gap-2 bg-surface-400 rounded-xl p-3">
              <code className="text-brand-400 text-sm flex-1 break-all text-left">{fullLink}</code>
              <button onClick={() => navigator.clipboard.writeText(fullLink)} className="btn btn-ghost btn-sm shrink-0">
                <Copy className="w-4 h-4" />
              </button>
            </div>
            <button onClick={onClose} className="btn btn-primary w-full">Listo</button>
          </div>
        )}
      </div>
    </div>
  )
}

// ---- Edición de vigencia ---------------------------------
function LicenseEditor({ tenant, onSaved }) {
  const [start, setStart] = useState(tenant.license_start)
  const [end,   setEnd]   = useState(tenant.license_end)
  const [saving, setSaving] = useState(false)

  const dirty = start !== tenant.license_start || end !== tenant.license_end

  const save = async () => {
    setSaving(true)
    try {
      await superApi.patch(`/super/tenants/${tenant.id}`, { license_start: start, license_end: end })
      onSaved()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex items-center gap-2">
      <input type="date" value={start} onChange={e => setStart(e.target.value)}
        className="px-2 py-1 rounded-lg bg-surface-400 border border-white/10 text-white text-xs" />
      <span className="text-gray-600 text-xs">→</span>
      <input type="date" value={end} onChange={e => setEnd(e.target.value)}
        className="px-2 py-1 rounded-lg bg-surface-400 border border-white/10 text-white text-xs" />
      {dirty && (
        <button onClick={save} disabled={saving} className="btn btn-primary btn-sm">
          {saving ? <Loader2 className="animate-spin h-3 w-3" /> : 'Guardar'}
        </button>
      )}
    </div>
  )
}

// ---- Dashboard -------------------------------------------
export default function SuperDashboard() {
  const navigate = useNavigate()
  const [tenants, setTenants] = useState(null)
  const [showNew, setShowNew] = useState(false)
  const [error,   setError]   = useState(null)

  const load = useCallback(async () => {
    try {
      setTenants(await superApi.get('/super/tenants'))
      setError(null)
    } catch (err) {
      setError(err.message)
    }
  }, [])

  useEffect(() => {
    if (!localStorage.getItem('pv_super_token')) { navigate('/super/login'); return }
    load()
  }, [load, navigate])

  const toggleActive = async (t) => {
    await superApi.patch(`/super/tenants/${t.id}`, { active: !t.active })
    load()
  }

  const handleLogout = () => {
    localStorage.removeItem('pv_super_token')
    navigate('/super/login')
  }

  return (
    <div className="min-h-screen bg-[#0d0d0d] p-4 sm:p-8">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="font-syne text-2xl font-bold text-white">Clientes</h1>
            <p className="text-gray-500 text-sm">Panel de plataforma PyroVenta</p>
          </div>
          <div className="flex gap-2">
            <button onClick={load} className="btn btn-ghost btn-sm"><RefreshCw className="w-4 h-4" /></button>
            <button onClick={() => setShowNew(true)} className="btn btn-primary btn-sm">
              <Plus className="w-4 h-4" /> Nuevo cliente
            </button>
            <button onClick={handleLogout} className="btn btn-ghost btn-sm"><LogOut className="w-4 h-4" /></button>
          </div>
        </div>

        {error && <p className="text-red-400 text-sm mb-4">{error}</p>}

        {!tenants ? (
          <div className="space-y-3">{[1, 2, 3].map(i => <div key={i} className="skeleton h-24 rounded-xl" />)}</div>
        ) : tenants.length === 0 ? (
          <div className="card bg-surface-300 border-white/8 p-10 text-center">
            <Building2 className="w-10 h-10 text-gray-600 mx-auto mb-3" />
            <p className="text-gray-400">Aún no hay clientes. Crea el primero.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {tenants.map(t => (
              <div key={t.id} className="card bg-surface-300 border-white/8 p-4">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-white truncate">{t.name}</p>
                      <StatusChip status={t.status} />
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">
                      /c/{t.slug}
                      {t.last_activity && ` · última venta: ${new Date(t.last_activity).toLocaleString('es-CO')}`}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-white font-semibold">{formatCOP(t.today_sales)}</p>
                    <p className="text-xs text-gray-500">{t.today_invoices} facturas hoy</p>
                  </div>
                  <button
                    onClick={() => toggleActive(t)}
                    className={`btn btn-sm ${t.active ? 'btn-ghost text-red-400' : 'btn-primary'}`}
                    title={t.active ? 'Suspender' : 'Reactivar'}
                  >
                    {t.active ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                    {t.active ? 'Suspender' : 'Activar'}
                  </button>
                </div>
                <div className="mt-3 pt-3 border-t border-white/5">
                  <LicenseEditor tenant={t} onSaved={load} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showNew && <NewTenantModal onClose={() => setShowNew(false)} onCreated={load} />}
    </div>
  )
}
```

- [ ] **Step 4: Rutas en `src/App.jsx`**

Imports:

```jsx
import SuperLoginPage from './pages/SuperLoginPage.jsx'
import SuperDashboard from './pages/SuperDashboard.jsx'
```

Dentro de `<Routes>`, antes del catch-all `*`:

```jsx
        <Route path="/super/login" element={<SuperLoginPage />} />
        <Route path="/super"       element={<SuperDashboard />} />
```

- [ ] **Step 5: Verificar `formatCOP` existe**

Run: `grep -n "export function formatCOP\|export const formatCOP" src/lib/format.js`
Expected: 1 match. Si el nombre difiere, ajustar el import en `SuperDashboard.jsx` al nombre real.

- [ ] **Step 6: Verificar build y commit**

```bash
npm run build
git add src/lib/superApi.js src/pages/SuperLoginPage.jsx src/pages/SuperDashboard.jsx src/App.jsx
git commit -m "feat(front): panel super admin con login, lista de clientes, wizard y vigencias"
```

---

### Task 11: Despliegue y verificación end-to-end

**Files:** ninguno nuevo (configuración + verificación).

- [ ] **Step 1: Configurar `JWT_SECRET` en Vercel**

Generar un secreto fuerte y configurarlo (production + preview + development):

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
npx vercel env add JWT_SECRET
```

(Si `vercel` CLI no está logueado, agregarlo desde el dashboard de Vercel → Settings → Environment Variables.)

- [ ] **Step 2: Aplicar schema y seed en Supabase**

1. Generar hash del super admin: `node scripts/hash-password.mjs <contraseña-elegida>` y pegarlo en `supabase/seed.sql` (NO commitear el hash real si el repo es público — ejecutarlo directo en el SQL editor).
2. En Supabase Dashboard → SQL Editor: ejecutar `supabase/schema.sql` completo, luego `supabase/seed.sql`.
3. Verificar: `SELECT slug, active, license_start, license_end FROM tenants;` → 1 fila (`demo`). `SELECT email FROM super_admins;` → 1 fila.
4. Re-habilitar realtime para invoices: Dashboard → Database → Replication → `invoices` ✓ (el DROP TABLE la saca de la publicación).

- [ ] **Step 3: Deploy**

```bash
git push
```

Esperar el deploy de Vercel (o `npx vercel --prod`).

- [ ] **Step 4: Verificación E2E — checklist completo contra el deploy**

Con `URL` = dominio del deploy:

1. **Bootstrap público**: `GET {URL}/api/public/tenant/demo` → 200 con tenant + 3 locations. `GET {URL}/api/public/tenant/noexiste` → 404 `code: TENANT_NOT_FOUND`.
2. **Login**: abrir `{URL}/c/demo` → login muestra "Pirotécnica La Chispa (Demo)" → elegir Local Principal → PIN `0000` → entra a admin.
3. **Token viejo rechazado**: `curl -H "Authorization: Bearer $(echo -n 'x:y' | base64)" {URL}/api/locations` → 401.
4. **Venta completa**: login vendedor (PIN 1111) → crear factura → login cajero (PIN 4444) en Stand Sur → buscar código → cobrar → imprime/OK.
5. **Panel super**: `{URL}/super/login` → email + contraseña → dashboard lista `demo` con ventas de hoy.
6. **Crear cliente nuevo** desde el wizard (nombre, vigencia, admin PIN) → copiar link `/c/<slug>` → abrirlo en ventana incógnita → login con el PIN del nuevo admin → crear un punto de venta y un producto.
7. **Aislamiento**: con el token del cliente nuevo (DevTools → localStorage `pv_token`), `curl -H "Authorization: Bearer <token>" {URL}/api/products` → NO aparecen los 12 productos de demo. Repetir con el token de demo → NO aparecen los del nuevo.
8. **Suspensión**: en el panel, suspender el cliente nuevo → en su sesión, cualquier acción → overlay "Acceso suspendido". Reactivar → vuelve a operar.
9. **Vigencia**: editar la vigencia del cliente nuevo a fechas pasadas → login en `/c/<slug>` → 403 con mensaje de licencia vencida.

- [ ] **Step 5: Commit final de ajustes** (si la verificación exigió correcciones)

```bash
git add -A
git commit -m "fix: ajustes post-verificacion e2e multitenant"
git push
```

---

## Self-Review (ejecutada al escribir el plan)

- **Cobertura del spec**: tenants + super_admins + tenant_id (Task 1); JWT + licencia en cada request (Tasks 2-3); `/c/:slug` + bootstrap público + login scoped (Tasks 4, 7, 8); scoping total de rutas con tenant_id desde token (Task 5); panel super completo — crear/suspender/vigencia/admin inicial/métricas (Tasks 6, 10); bloqueo por licencia en frontend (Task 9); RLS sin políticas anon + realtime intacto (Task 1 + verificación en Task 11 paso 2.4); env JWT_SECRET (Task 11). Ajuste documentado respecto al spec: el bootstrap público NO devuelve sellers.
- **Placeholders**: ninguno — todo el código está completo.
- **Consistencia de tipos**: `requireAuth` retorna `{ seller, tenant, tenantId, locationId }` y todos los handlers usan `auth.tenantId` / `auth.tenant.name` / `auth.seller`; `login()` de 4 args se usa igual en authStore (Task 7) y LoginPage (Task 8); códigos de licencia idénticos en `tenantStatus.js`, `api.js` y `LicenseBlock`/`STATUS_LABEL`.
