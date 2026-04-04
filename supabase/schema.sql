-- =====================================================
-- PyroVenta — Schema Supabase (PostgreSQL)
-- Ejecutar en el SQL Editor del dashboard de Supabase
-- =====================================================

-- ---- PUNTOS DE VENTA --------------------------------
CREATE TABLE IF NOT EXISTS locations (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name           TEXT NOT NULL,
  address        TEXT,
  printer_config JSONB NOT NULL DEFAULT '{}',
  active         BOOLEAN NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---- VENDEDORES -------------------------------------
CREATE TABLE IF NOT EXISTS sellers (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  pin        CHAR(4) NOT NULL,
  role       TEXT NOT NULL DEFAULT 'seller'
             CHECK (role IN ('seller', 'cashier', 'admin')),
  active     BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---- RELACIÓN VENDEDOR ↔ PUNTO DE VENTA (N:M) ------
CREATE TABLE IF NOT EXISTS seller_locations (
  seller_id   UUID NOT NULL REFERENCES sellers(id)   ON DELETE CASCADE,
  location_id UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  PRIMARY KEY (seller_id, location_id)
);

-- ---- CATEGORÍAS (globales) --------------------------
CREATE TABLE IF NOT EXISTS categories (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  icon       TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  active     BOOLEAN NOT NULL DEFAULT true
);

-- ---- PRODUCTOS (globales) ---------------------------
CREATE TABLE IF NOT EXISTS products (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  category_id UUID REFERENCES categories(id),
  description TEXT,
  active      BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---- PRESENTACIONES (por producto) -----------------
CREATE TABLE IF NOT EXISTS presentations (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  label      TEXT NOT NULL,
  price      NUMERIC(12,2) NOT NULL,
  active     BOOLEAN NOT NULL DEFAULT true
);

-- ---- STOCK (por punto de venta) --------------------
CREATE TABLE IF NOT EXISTS stock (
  product_id  UUID NOT NULL REFERENCES products(id)   ON DELETE CASCADE,
  location_id UUID NOT NULL REFERENCES locations(id)  ON DELETE CASCADE,
  quantity    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (product_id, location_id)
);

-- ---- CAJAS / REGISTRADORAS (por punto de venta) ----
CREATE TABLE IF NOT EXISTS registers (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,            -- 'Caja 1', 'Caja 2', etc.
  active      BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_registers_location ON registers(location_id);

-- ---- FACTURAS ---------------------------------------
CREATE TABLE IF NOT EXISTS invoices (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code          CHAR(4) NOT NULL,
  location_id   UUID NOT NULL REFERENCES locations(id),
  location_name TEXT,                       -- snapshot
  seller_id     UUID REFERENCES sellers(id),
  seller_name   TEXT,                       -- snapshot
  total         NUMERIC(12,2) NOT NULL DEFAULT 0,
  status        TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'paid', 'cancelled')),
  pay_method    TEXT CHECK (pay_method IN ('cash', 'transfer', 'card')),
  items         JSONB NOT NULL DEFAULT '[]', -- snapshot completo
  register_id   UUID REFERENCES registers(id), -- caja que cobró
  register_name TEXT,                         -- snapshot nombre de caja
  cashier_id    UUID REFERENCES sellers(id),  -- cajero(a) que cobró
  cashier_name  TEXT,                         -- snapshot nombre cajero(a)
  observations  TEXT,                        -- notas opcionales (obsequios, ajustes, etc.)
  edited_by     UUID REFERENCES sellers(id), -- quién editó la factura (cajero/admin)
  edited_at     TIMESTAMPTZ,                 -- cuándo se editó
  printed       BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  paid_at       TIMESTAMPTZ,
  cancelled_at  TIMESTAMPTZ
);

-- ---- ÍNDICES ----------------------------------------

-- Unicidad parcial: code único por location SOLO entre facturas PENDING
-- Esto permite reusar códigos una vez cobrada/cancelada la factura
CREATE UNIQUE INDEX IF NOT EXISTS invoices_pending_code_location
  ON invoices(code, location_id)
  WHERE status = 'pending';

-- Búsqueda rápida por código dentro de un punto de venta
CREATE INDEX IF NOT EXISTS idx_invoices_code_location
  ON invoices(code, location_id);

-- Búsqueda de facturas por estado dentro de un punto de venta (PendingList)
CREATE INDEX IF NOT EXISTS idx_invoices_location_status
  ON invoices(location_id, status);

-- Reportes por fecha
CREATE INDEX IF NOT EXISTS idx_invoices_created_at
  ON invoices(created_at);


-- =====================================================
-- FUNCIÓN: Generación atómica de código ALEATORIO sin race condition
-- Genera un código aleatorio 1000-9999 que no esté pendiente
-- =====================================================
CREATE OR REPLACE FUNCTION get_next_invoice_code(p_location_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_code INTEGER;
  v_attempts INTEGER := 0;
BEGIN
  -- Intentar código aleatorio (rápido si hay pocos pendientes)
  LOOP
    v_code := 1000 + floor(random() * 9000)::INTEGER;
    v_attempts := v_attempts + 1;

    IF NOT EXISTS (
      SELECT 1
      FROM   invoices
      WHERE  location_id = p_location_id
        AND  status      = 'pending'
        AND  code        = v_code::TEXT
    ) THEN
      RETURN v_code::TEXT;
    END IF;

    -- Si tras 50 intentos aleatorios no encontró, buscar secuencialmente
    IF v_attempts >= 50 THEN
      FOR v_code IN 1000..9999 LOOP
        IF NOT EXISTS (
          SELECT 1
          FROM   invoices
          WHERE  location_id = p_location_id
            AND  status      = 'pending'
            AND  code        = v_code::TEXT
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
-- ROW LEVEL SECURITY (RLS)
-- Las serverless functions usan service key → bypasean RLS
-- La anon key del frontend solo puede leer catálogo
-- =====================================================
ALTER TABLE locations    ENABLE ROW LEVEL SECURITY;
ALTER TABLE sellers      ENABLE ROW LEVEL SECURITY;
ALTER TABLE seller_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories   ENABLE ROW LEVEL SECURITY;
ALTER TABLE products     ENABLE ROW LEVEL SECURITY;
ALTER TABLE presentations ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock        ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices     ENABLE ROW LEVEL SECURITY;

-- Anon key puede leer catálogo (para el frontend sin autenticación en la pantalla de login)
CREATE POLICY "anon_read_locations"
  ON locations FOR SELECT USING (true);

CREATE POLICY "anon_read_categories"
  ON categories FOR SELECT USING (active = true);

CREATE POLICY "anon_read_products"
  ON products FOR SELECT USING (active = true);

CREATE POLICY "anon_read_presentations"
  ON presentations FOR SELECT USING (active = true);

-- Todas las demás operaciones van via service key (serverless functions)


-- =====================================================
-- REALTIME: Habilitar replicación para facturas
-- También ejecutar en: Dashboard → Database → Replication
-- =====================================================
-- (Ejecutar en Supabase Dashboard → Database → Replication → invoices ✓)
-- ALTER PUBLICATION supabase_realtime ADD TABLE invoices;
