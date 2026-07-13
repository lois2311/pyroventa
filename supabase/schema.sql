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
-- FUNCIONES DE REPORTES POR RANGO (corte de día en hora Bogotá)
-- Todas filtran por tenant y agregan dentro de Postgres para
-- evitar el límite de filas de PostgREST y transferencias grandes.
-- p_from / p_to son fechas Bogotá inclusivas.
-- =====================================================

-- ---- Resumen del rango ------------------------------
CREATE OR REPLACE FUNCTION report_range_summary(
  p_tenant_id   UUID,
  p_from        DATE,
  p_to          DATE,
  p_location_id UUID DEFAULT NULL,
  p_seller_id   UUID DEFAULT NULL,
  p_register_id UUID DEFAULT NULL
)
RETURNS TABLE(
  total_revenue   NUMERIC,
  invoice_count   BIGINT,
  pending_count   BIGINT,
  cancelled_count BIGINT,
  cash            NUMERIC,
  transfer        NUMERIC,
  card            NUMERIC
)
LANGUAGE sql STABLE
AS $$
  SELECT
    COALESCE(SUM(i.total) FILTER (WHERE i.status = 'paid'), 0),
    COUNT(*) FILTER (WHERE i.status = 'paid'),
    COUNT(*) FILTER (WHERE i.status = 'pending'),
    COUNT(*) FILTER (WHERE i.status = 'cancelled'),
    COALESCE(SUM(i.total) FILTER (WHERE i.status = 'paid' AND i.pay_method = 'cash'), 0),
    COALESCE(SUM(i.total) FILTER (WHERE i.status = 'paid' AND i.pay_method = 'transfer'), 0),
    COALESCE(SUM(i.total) FILTER (WHERE i.status = 'paid' AND i.pay_method = 'card'), 0)
  FROM invoices i
  WHERE i.tenant_id = p_tenant_id
    AND (i.created_at AT TIME ZONE 'America/Bogota')::date BETWEEN p_from AND p_to
    AND (p_location_id IS NULL OR i.location_id = p_location_id)
    AND (p_seller_id   IS NULL OR i.seller_id   = p_seller_id)
    AND (p_register_id IS NULL OR i.register_id = p_register_id)
$$;

-- ---- Tendencia día por día (solo pagadas) -----------
CREATE OR REPLACE FUNCTION report_range_by_day(
  p_tenant_id   UUID,
  p_from        DATE,
  p_to          DATE,
  p_location_id UUID DEFAULT NULL,
  p_seller_id   UUID DEFAULT NULL,
  p_register_id UUID DEFAULT NULL
)
RETURNS TABLE(
  day           DATE,
  total_revenue NUMERIC,
  invoice_count BIGINT,
  cash          NUMERIC,
  transfer      NUMERIC,
  card          NUMERIC
)
LANGUAGE sql STABLE
AS $$
  SELECT
    (i.created_at AT TIME ZONE 'America/Bogota')::date,
    COALESCE(SUM(i.total), 0),
    COUNT(*),
    COALESCE(SUM(i.total) FILTER (WHERE i.pay_method = 'cash'), 0),
    COALESCE(SUM(i.total) FILTER (WHERE i.pay_method = 'transfer'), 0),
    COALESCE(SUM(i.total) FILTER (WHERE i.pay_method = 'card'), 0)
  FROM invoices i
  WHERE i.tenant_id = p_tenant_id
    AND i.status = 'paid'
    AND (i.created_at AT TIME ZONE 'America/Bogota')::date BETWEEN p_from AND p_to
    AND (p_location_id IS NULL OR i.location_id = p_location_id)
    AND (p_seller_id   IS NULL OR i.seller_id   = p_seller_id)
    AND (p_register_id IS NULL OR i.register_id = p_register_id)
  GROUP BY 1
  ORDER BY 1
$$;

-- ---- Por vendedor (solo pagadas) --------------------
CREATE OR REPLACE FUNCTION report_range_by_seller(
  p_tenant_id   UUID,
  p_from        DATE,
  p_to          DATE,
  p_location_id UUID DEFAULT NULL
)
RETURNS TABLE(
  seller_id     UUID,
  seller_name   TEXT,
  total_revenue NUMERIC,
  invoice_count BIGINT,
  cash          NUMERIC,
  transfer      NUMERIC,
  card          NUMERIC
)
LANGUAGE sql STABLE
AS $$
  SELECT
    i.seller_id,
    COALESCE(MAX(i.seller_name), 'Desconocido'),
    COALESCE(SUM(i.total), 0),
    COUNT(*),
    COALESCE(SUM(i.total) FILTER (WHERE i.pay_method = 'cash'), 0),
    COALESCE(SUM(i.total) FILTER (WHERE i.pay_method = 'transfer'), 0),
    COALESCE(SUM(i.total) FILTER (WHERE i.pay_method = 'card'), 0)
  FROM invoices i
  WHERE i.tenant_id = p_tenant_id
    AND i.status = 'paid'
    AND (i.created_at AT TIME ZONE 'America/Bogota')::date BETWEEN p_from AND p_to
    AND (p_location_id IS NULL OR i.location_id = p_location_id)
  GROUP BY i.seller_id
  ORDER BY 3 DESC
$$;

-- ---- Por caja (solo pagadas) ------------------------
CREATE OR REPLACE FUNCTION report_range_by_register(
  p_tenant_id   UUID,
  p_from        DATE,
  p_to          DATE,
  p_location_id UUID DEFAULT NULL
)
RETURNS TABLE(
  register_id   UUID,
  register_name TEXT,
  cashier_name  TEXT,
  total_revenue NUMERIC,
  invoice_count BIGINT,
  cash          NUMERIC,
  transfer      NUMERIC,
  card          NUMERIC
)
LANGUAGE sql STABLE
AS $$
  SELECT
    i.register_id,
    COALESCE(MAX(i.register_name), 'Sin caja'),
    MAX(i.cashier_name),
    COALESCE(SUM(i.total), 0),
    COUNT(*),
    COALESCE(SUM(i.total) FILTER (WHERE i.pay_method = 'cash'), 0),
    COALESCE(SUM(i.total) FILTER (WHERE i.pay_method = 'transfer'), 0),
    COALESCE(SUM(i.total) FILTER (WHERE i.pay_method = 'card'), 0)
  FROM invoices i
  WHERE i.tenant_id = p_tenant_id
    AND i.status = 'paid'
    AND (i.created_at AT TIME ZONE 'America/Bogota')::date BETWEEN p_from AND p_to
    AND (p_location_id IS NULL OR i.location_id = p_location_id)
  GROUP BY i.register_id
  ORDER BY 4 DESC
$$;

-- ---- Por punto de venta (incluye pendientes/canceladas) ----
CREATE OR REPLACE FUNCTION report_range_by_location(
  p_tenant_id UUID,
  p_from      DATE,
  p_to        DATE
)
RETURNS TABLE(
  location_id     UUID,
  location_name   TEXT,
  total_revenue   NUMERIC,
  invoice_count   BIGINT,
  pending_count   BIGINT,
  cancelled_count BIGINT,
  cash            NUMERIC,
  transfer        NUMERIC,
  card            NUMERIC
)
LANGUAGE sql STABLE
AS $$
  SELECT
    i.location_id,
    COALESCE(MAX(i.location_name), 'Desconocido'),
    COALESCE(SUM(i.total) FILTER (WHERE i.status = 'paid'), 0),
    COUNT(*) FILTER (WHERE i.status = 'paid'),
    COUNT(*) FILTER (WHERE i.status = 'pending'),
    COUNT(*) FILTER (WHERE i.status = 'cancelled'),
    COALESCE(SUM(i.total) FILTER (WHERE i.status = 'paid' AND i.pay_method = 'cash'), 0),
    COALESCE(SUM(i.total) FILTER (WHERE i.status = 'paid' AND i.pay_method = 'transfer'), 0),
    COALESCE(SUM(i.total) FILTER (WHERE i.status = 'paid' AND i.pay_method = 'card'), 0)
  FROM invoices i
  WHERE i.tenant_id = p_tenant_id
    AND (i.created_at AT TIME ZONE 'America/Bogota')::date BETWEEN p_from AND p_to
  GROUP BY i.location_id
  ORDER BY 3 DESC
$$;

-- ---- Productos vendidos (desglose por presentación) ----
CREATE OR REPLACE FUNCTION report_range_products(
  p_tenant_id   UUID,
  p_from        DATE,
  p_to          DATE,
  p_location_id UUID DEFAULT NULL,
  p_seller_id   UUID DEFAULT NULL,
  p_register_id UUID DEFAULT NULL
)
RETURNS TABLE(
  product_name  TEXT,
  label         TEXT,
  total_qty     BIGINT,
  total_revenue NUMERIC
)
LANGUAGE sql STABLE
AS $$
  SELECT
    COALESCE(item->>'product_name', item->>'label', '?'),
    COALESCE(item->>'label', 'Unidad'),
    COALESCE(SUM(COALESCE((item->>'qty')::numeric, 0)), 0)::bigint,
    COALESCE(SUM(COALESCE((item->>'subtotal')::numeric, 0)), 0)
  FROM invoices i
  CROSS JOIN LATERAL jsonb_array_elements(i.items) AS item
  WHERE i.tenant_id = p_tenant_id
    AND i.status = 'paid'
    AND jsonb_typeof(i.items) = 'array'
    AND (i.created_at AT TIME ZONE 'America/Bogota')::date BETWEEN p_from AND p_to
    AND (p_location_id IS NULL OR i.location_id = p_location_id)
    AND (p_seller_id   IS NULL OR i.seller_id   = p_seller_id)
    AND (p_register_id IS NULL OR i.register_id = p_register_id)
  GROUP BY 1, 2
  ORDER BY 4 DESC
$$;

-- ---- Por hora del día (hora Bogotá, solo pagadas) ----
CREATE OR REPLACE FUNCTION report_range_by_hour(
  p_tenant_id   UUID,
  p_from        DATE,
  p_to          DATE,
  p_location_id UUID DEFAULT NULL,
  p_seller_id   UUID DEFAULT NULL,
  p_register_id UUID DEFAULT NULL
)
RETURNS TABLE(
  hour          TEXT,
  invoice_count BIGINT,
  total_revenue NUMERIC
)
LANGUAGE sql STABLE
AS $$
  SELECT
    to_char(i.created_at AT TIME ZONE 'America/Bogota', 'HH24:00'),
    COUNT(*),
    COALESCE(SUM(i.total), 0)
  FROM invoices i
  WHERE i.tenant_id = p_tenant_id
    AND i.status = 'paid'
    AND (i.created_at AT TIME ZONE 'America/Bogota')::date BETWEEN p_from AND p_to
    AND (p_location_id IS NULL OR i.location_id = p_location_id)
    AND (p_seller_id   IS NULL OR i.seller_id   = p_seller_id)
    AND (p_register_id IS NULL OR i.register_id = p_register_id)
  GROUP BY 1
  ORDER BY 1
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
