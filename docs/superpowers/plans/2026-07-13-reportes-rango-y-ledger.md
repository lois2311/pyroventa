# Reportes por rango + cierre del ledger — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reportes con rango de fechas (agregación en SQL, corte de día en hora Bogotá), detalle por caja, desglose de productos por vendedor/caja, export XLSX; y cierre de los 14 pendientes del ledger multitenant.

**Architecture:** 7 funciones SQL `report_range_*` agregan dentro de Postgres (evitan el límite de 1.000 filas de PostgREST). Los 6 endpoints de reportes existentes se reescriben para llamar RPCs conservando los shapes de respuesta actuales; se agrega `/reports/register-detail`. El frontend pasa de fecha única a desde/hasta. Los ítems del ledger son cambios puntuales en API y frontend.

**Tech Stack:** Postgres (Supabase, SQL functions), Vercel serverless catch-all, React 18 + Vite, `xlsx` (ya instalada, import dinámico), vitest.

**Spec:** `docs/superpowers/specs/2026-07-13-reportes-rango-y-ledger-design.md`

## Global Constraints

- Todo en español (mensajes, UI, comentarios).
- Corte de día SIEMPRE en `America/Bogota`: en SQL vía `(created_at AT TIME ZONE 'America/Bogota')::date`, en JS vía `bogotaDate()`/`bogotaDayBounds()` (Task 2). Bogotá no tiene DST → offset fijo `-05:00`.
- `from`/`to` son fechas `YYYY-MM-DD` **inclusivas**; `date` se conserva como retrocompatibilidad (`from=to=date`); sin parámetros → hoy Bogotá. `to < from` → 400.
- Los shapes de respuesta que consumen los componentes existentes NO cambian (los handlers mapean columnas RPC → shape actual). Campos que consumen: sellers `{seller_id, seller_name, total, count, avg_ticket, by_method:{cash,transfer,card}}`; registers `{register_id, register_name, cashier_name, total, count, avg_ticket, by_method}`; daily `{total_revenue, invoice_count, avg_ticket, pending_count, cancelled_count, by_pay_method:{cash,transfer,card}, by_location:[{id,name,total,count}]}`; locations `{location_id, location_name, address, total_revenue, invoice_count, pending_count, cancelled_count, avg_ticket, by_pay_method}`; top-products `{product_name, total_qty, total_revenue, presentations:[{label,qty,revenue}]}`; seller-detail `{seller, summary:{...daily-like}, by_hour:[{hour,count,revenue}], top_products:[{name,qty,revenue}], invoices:[...]}`.
- Solo facturas `status='paid'` cuentan para revenue; `pending_count`/`cancelled_count` solo en summary y by_location.
- Todas las RPC reciben `p_tenant_id` y los handlers SIEMPRE pasan `auth.tenantId`.
- El schema de producción NO está aplicado (Task 11 multitenant pendiente): los cambios SQL van directo a `supabase/schema.sql`, sin migración.
- Un solo serverless function (catch-all); handlers nuevos en `api/_lib/` si el archivo crece.
- Suite actual: 15 tests — debe seguir en verde; `npm run build` limpio en cada tarea.

---

### Task 1: Funciones SQL de agregación por rango

**Files:**
- Modify: `supabase/schema.sql` (agregar al final, después de `tenant_last_activity`)

**Interfaces:**
- Produces: 7 funciones `report_range_*` con las firmas exactas de abajo. Consumidas vía `supabaseAdmin.rpc('report_range_summary', { p_tenant_id, p_from, p_to, p_location_id, p_seller_id, p_register_id })` etc. Parámetros opcionales con DEFAULT NULL pueden omitirse en el llamado.

- [ ] **Step 1: Agregar al final de `supabase/schema.sql`**

```sql
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
```

- [ ] **Step 2: Verificación visual** — cada función: qualifica columnas con `i.`, filtra `p_tenant_id`, usa el corte Bogotá, y su RETURNS TABLE coincide con el SELECT. No hay runner local; la ejecución real es en el deploy.

- [ ] **Step 3: Commit**

```bash
git add supabase/schema.sql
git commit -m "feat(db): funciones SQL de reportes por rango con corte de dia en hora Bogota"
```

---

### Task 2: Helpers puros con tests (fechas Bogotá, parseRange, classifyBootstrapError, jwt hardening)

**Files:**
- Modify: `api/_lib/tenantStatus.js`
- Create: `api/_lib/range.js`
- Modify: `api/_lib/jwt.js`
- Create: `src/lib/bootstrapError.js`
- Test: `api/_lib/__tests__/range.test.js`, `api/_lib/__tests__/jwt.test.js` (agregar), `src/lib/__tests__/bootstrapError.test.js`

**Interfaces:**
- Produces: `bogotaDate(d?: Date) → 'YYYY-MM-DD'` exportada desde `tenantStatus.js`.
- Produces: `parseRange(query) → { from, to }` (lanza Error con `.status = 400` si inválido) y `bogotaDayBounds(from, to) → { start: ISO, end: ISO }` (end exclusivo = día siguiente de `to` a las 00:00 Bogotá) desde `range.js`.
- Produces: `classifyBootstrapError(err) → { clearSlug: boolean, message: string }` desde `src/lib/bootstrapError.js`.

- [ ] **Step 1: Tests primero (fallan)**

`api/_lib/__tests__/range.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { parseRange, bogotaDayBounds } from '../range.js'

describe('parseRange', () => {
  it('from y to explícitos', () => {
    expect(parseRange({ from: '2026-12-01', to: '2026-12-24' })).toEqual({ from: '2026-12-01', to: '2026-12-24' })
  })
  it('date de retrocompatibilidad → from=to', () => {
    expect(parseRange({ date: '2026-12-24' })).toEqual({ from: '2026-12-24', to: '2026-12-24' })
  })
  it('sin parámetros → hoy Bogotá (from === to, formato YYYY-MM-DD)', () => {
    const r = parseRange({})
    expect(r.from).toBe(r.to)
    expect(r.from).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
  it('to < from → 400', () => {
    expect(() => parseRange({ from: '2026-12-24', to: '2026-12-01' })).toThrowError(/rango/i)
    try { parseRange({ from: '2026-12-24', to: '2026-12-01' }) } catch (e) { expect(e.status).toBe(400) }
  })
  it('formato inválido → 400', () => {
    try { parseRange({ from: '24/12/2026', to: '2026-12-24' }) } catch (e) { expect(e.status).toBe(400) }
  })
  it('solo from → to = from', () => {
    expect(parseRange({ from: '2026-12-01' })).toEqual({ from: '2026-12-01', to: '2026-12-01' })
  })
})

describe('bogotaDayBounds', () => {
  it('límites de un día en -05:00', () => {
    const { start, end } = bogotaDayBounds('2026-12-31', '2026-12-31')
    expect(start).toBe('2026-12-31T05:00:00.000Z') // 00:00 Bogotá
    expect(end).toBe('2027-01-01T05:00:00.000Z')   // 00:00 Bogotá del día siguiente
  })
})
```

`src/lib/__tests__/bootstrapError.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { classifyBootstrapError } from '../bootstrapError.js'

describe('classifyBootstrapError', () => {
  it('404/403 → soltar el amarre con el mensaje del servidor', () => {
    const e = Object.assign(new Error('Empresa no encontrada'), { status: 404 })
    expect(classifyBootstrapError(e)).toEqual({ clearSlug: true, message: 'Empresa no encontrada' })
    const e2 = Object.assign(new Error('Licencia vencida'), { status: 403 })
    expect(classifyBootstrapError(e2).clearSlug).toBe(true)
  })
  it('5xx → conservar slug con mensaje de servidor', () => {
    const e = Object.assign(new Error('Error interno'), { status: 500 })
    expect(classifyBootstrapError(e)).toEqual({ clearSlug: false, message: 'Error del servidor — reintenta en un momento' })
  })
  it('sin status (red) → conservar slug con el mensaje del error', () => {
    const e = new Error('Sin conexión a internet')
    expect(classifyBootstrapError(e)).toEqual({ clearSlug: false, message: 'Sin conexión a internet' })
  })
})
```

Agregar a `api/_lib/__tests__/jwt.test.js`:

```js
  it('expiración por defecto es 7 días', async () => {
    const token = await signToken({ tenantId: 't1' })
    const claims = await verifyJwt(token)
    expect(claims.exp - claims.iat).toBe(7 * 24 * 3600)
  })
```

- [ ] **Step 2: Run → FAIL** (`npm test`: módulos no existen / test nuevo falla).

- [ ] **Step 3: Implementar**

`api/_lib/tenantStatus.js` — reemplazar el cuerpo manteniendo `getTenantStatus`:

```js
// Zona horaria del negocio: los cortes de día (licencias y reportes)
// se evalúan en hora local de Colombia, no en UTC.
const BOGOTA_TZ = 'America/Bogota'
const DATE_FMT  = new Intl.DateTimeFormat('en-CA', { timeZone: BOGOTA_TZ })

/** Fecha 'YYYY-MM-DD' en hora de Bogotá. */
export function bogotaDate(d = new Date()) {
  return DATE_FMT.format(d)
}

export function getTenantStatus(tenant, today = new Date()) {
  if (!tenant) {
    return { ok: false, code: 'TENANT_NOT_FOUND', message: 'Empresa no encontrada' }
  }
  if (!tenant.active) {
    return { ok: false, code: 'TENANT_SUSPENDED', message: 'Empresa suspendida. Contacte a su proveedor.' }
  }
  const d = bogotaDate(today)
  if (d < tenant.license_start) {
    return { ok: false, code: 'LICENSE_NOT_STARTED', message: 'La licencia aún no está vigente.' }
  }
  if (d > tenant.license_end) {
    return { ok: false, code: 'LICENSE_EXPIRED', message: 'Licencia vencida. Contacte a su proveedor.' }
  }
  return { ok: true }
}
```

`api/_lib/range.js`:

```js
import { bogotaDate } from './tenantStatus.js'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function badRequest(message) {
  const err = new Error(message)
  err.status = 400
  return err
}

/**
 * Resuelve el rango de fechas de un reporte desde req.query.
 * Acepta from/to (inclusivos), date (retrocompatibilidad) o nada (hoy Bogotá).
 */
export function parseRange(query = {}) {
  const { from, to, date } = query
  let f, t
  if (from || to) { f = from || to; t = to || from }
  else if (date)  { f = date; t = date }
  else            { f = bogotaDate(); t = f }

  if (!DATE_RE.test(f) || !DATE_RE.test(t)) throw badRequest('Fechas inválidas — usa formato YYYY-MM-DD')
  if (t < f) throw badRequest('El rango es inválido: "hasta" es anterior a "desde"')
  return { from: f, to: t }
}

/**
 * Límites timestamptz de un rango de días Bogotá (-05:00, sin DST):
 * start = 00:00 Bogotá de `from`; end (exclusivo) = 00:00 Bogotá del día siguiente a `to`.
 */
export function bogotaDayBounds(from, to) {
  const start = new Date(`${from}T00:00:00-05:00`)
  const end   = new Date(`${to}T00:00:00-05:00`)
  end.setUTCDate(end.getUTCDate() + 1)
  return { start: start.toISOString(), end: end.toISOString() }
}
```

`api/_lib/jwt.js` — en `verifyJwt`, restringir algoritmos:

```js
export async function verifyJwt(token) {
  const { payload } = await jwtVerify(token, secret(), { algorithms: ['HS256'] })
  return payload
}
```

`src/lib/bootstrapError.js`:

```js
/**
 * Clasifica el error del bootstrap de empresa (GET /public/tenant/:slug).
 * Solo un rechazo definitivo del servidor (404/403) suelta el amarre del dispositivo.
 */
export function classifyBootstrapError(err) {
  if (err.status === 404 || err.status === 403) {
    return { clearSlug: true, message: err.message }
  }
  if (err.status) {
    return { clearSlug: false, message: 'Error del servidor — reintenta en un momento' }
  }
  return { clearSlug: false, message: err.message || 'Sin conexión — reintenta en un momento' }
}
```

- [ ] **Step 4: Run → PASS** (`npm test`: 15 + 10 nuevos ≈ 25). `npm run build` limpio.

- [ ] **Step 5: Commit**

```bash
git add api/_lib/tenantStatus.js api/_lib/range.js api/_lib/jwt.js src/lib/bootstrapError.js api/_lib/__tests__ src/lib/__tests__
git commit -m "feat: helpers de rango Bogota, classifyBootstrapError y hardening JWT con tests"
```

---

### Task 3: API de reportes por rango (reescritura de handlers + register-detail)

**Files:**
- Modify: `api/[[...path]].js` (router + los 6 handlers de reports + `invoicesHistory`; agregar `reportRegisterDetail`)

**Interfaces:**
- Consumes: RPCs de Task 1, `parseRange`/`bogotaDayBounds` de Task 2 (`import { parseRange, bogotaDayBounds } from './_lib/range.js'`).
- Produces: mismos endpoints con `from`/`to`; shapes de respuesta según Global Constraints; nuevo `GET /reports/register-detail?register_id=...&from&to&location_id`.

- [ ] **Step 1: Import + ruta nueva en el router**

Agregar import de range.js junto a los demás. En el bloque REPORTS del router, agregar:

```js
  if (route === '/reports/register-detail' && method === 'GET') return reportRegisterDetail(req, res)
```

- [ ] **Step 2: Reemplazar los 6 handlers de reports y agregar el 7º**

Patrón común al inicio de cada handler:

```js
  const auth = await requireAuth(req, res); if (!auth) return
  let range
  try { range = parseRange(req.query) } catch (e) { return res.status(e.status || 400).json({ error: e.message }) }
  const { from, to } = range
```

Código completo de los handlers:

```js
async function reportDaily(req, res) {
  const auth = await requireAuth(req, res); if (!auth) return
  let range
  try { range = parseRange(req.query) } catch (e) { return res.status(e.status || 400).json({ error: e.message }) }
  const { from, to } = range
  const { location_id } = req.query

  const { data: summaryRows, error } = await supabaseAdmin.rpc('report_range_summary', {
    p_tenant_id: auth.tenantId, p_from: from, p_to: to,
    p_location_id: location_id || null,
  })
  if (error) return res.status(500).json({ error: error.message })
  const s = summaryRows?.[0] || {}
  const tr = Number(s.total_revenue || 0), ic = Number(s.invoice_count || 0)

  const result = {
    from, to,
    date: from === to ? from : undefined, // retrocompatibilidad
    location_id: location_id || null,
    total_revenue: tr,
    invoice_count: ic,
    avg_ticket: ic > 0 ? tr / ic : 0,
    pending_count: Number(s.pending_count || 0),
    cancelled_count: Number(s.cancelled_count || 0),
    by_pay_method: { cash: Number(s.cash || 0), transfer: Number(s.transfer || 0), card: Number(s.card || 0) },
    by_day: [],
    by_location: [],
  }

  if (from !== to) {
    const { data: days } = await supabaseAdmin.rpc('report_range_by_day', {
      p_tenant_id: auth.tenantId, p_from: from, p_to: to,
      p_location_id: location_id || null,
    })
    result.by_day = (days || []).map(d => ({
      day: d.day,
      total_revenue: Number(d.total_revenue || 0),
      invoice_count: Number(d.invoice_count || 0),
      cash: Number(d.cash || 0), transfer: Number(d.transfer || 0), card: Number(d.card || 0),
    }))
  }

  if (!location_id) {
    const { data: locs } = await supabaseAdmin.rpc('report_range_by_location', {
      p_tenant_id: auth.tenantId, p_from: from, p_to: to,
    })
    result.by_location = (locs || []).map(l => ({
      id: l.location_id, name: l.location_name,
      total: Number(l.total_revenue || 0), count: Number(l.invoice_count || 0),
    }))
  }

  return res.status(200).json(result)
}

async function reportSellers(req, res) {
  const auth = await requireAuth(req, res); if (!auth) return
  let range
  try { range = parseRange(req.query) } catch (e) { return res.status(e.status || 400).json({ error: e.message }) }
  const { location_id } = req.query
  const { data, error } = await supabaseAdmin.rpc('report_range_by_seller', {
    p_tenant_id: auth.tenantId, p_from: range.from, p_to: range.to,
    p_location_id: location_id || null,
  })
  if (error) return res.status(500).json({ error: error.message })
  return res.status(200).json((data || []).map(r => {
    const total = Number(r.total_revenue || 0), count = Number(r.invoice_count || 0)
    return {
      seller_id: r.seller_id, seller_name: r.seller_name,
      total, count, avg_ticket: count > 0 ? total / count : 0,
      by_method: { cash: Number(r.cash || 0), transfer: Number(r.transfer || 0), card: Number(r.card || 0) },
    }
  }))
}

async function reportRegisters(req, res) {
  const auth = await requireAuth(req, res); if (!auth) return
  let range
  try { range = parseRange(req.query) } catch (e) { return res.status(e.status || 400).json({ error: e.message }) }
  const { location_id } = req.query
  const { data, error } = await supabaseAdmin.rpc('report_range_by_register', {
    p_tenant_id: auth.tenantId, p_from: range.from, p_to: range.to,
    p_location_id: location_id || null,
  })
  if (error) return res.status(500).json({ error: error.message })
  return res.status(200).json((data || []).map(r => {
    const total = Number(r.total_revenue || 0), count = Number(r.invoice_count || 0)
    return {
      register_id: r.register_id, register_name: r.register_name, cashier_name: r.cashier_name,
      total, count, avg_ticket: count > 0 ? total / count : 0,
      by_method: { cash: Number(r.cash || 0), transfer: Number(r.transfer || 0), card: Number(r.card || 0) },
    }
  }))
}

async function reportLocations(req, res) {
  const auth = await requireAuth(req, res); if (!auth) return
  let range
  try { range = parseRange(req.query) } catch (e) { return res.status(e.status || 400).json({ error: e.message }) }
  const [{ data, error }, { data: locRows }] = await Promise.all([
    supabaseAdmin.rpc('report_range_by_location', {
      p_tenant_id: auth.tenantId, p_from: range.from, p_to: range.to,
    }),
    supabaseAdmin.from('locations').select('id, name, address').eq('tenant_id', auth.tenantId),
  ])
  if (error) return res.status(500).json({ error: error.message })
  const addr = {}; (locRows || []).forEach(l => { addr[l.id] = l.address })
  return res.status(200).json((data || []).map(l => {
    const tr = Number(l.total_revenue || 0), ic = Number(l.invoice_count || 0)
    return {
      location_id: l.location_id, location_name: l.location_name, address: addr[l.location_id] || null,
      total_revenue: tr, invoice_count: ic,
      pending_count: Number(l.pending_count || 0), cancelled_count: Number(l.cancelled_count || 0),
      avg_ticket: ic > 0 ? tr / ic : 0,
      by_pay_method: { cash: Number(l.cash || 0), transfer: Number(l.transfer || 0), card: Number(l.card || 0) },
    }
  }))
}

async function reportTopProducts(req, res) {
  const auth = await requireAuth(req, res); if (!auth) return
  let range
  try { range = parseRange(req.query) } catch (e) { return res.status(e.status || 400).json({ error: e.message }) }
  const { location_id, seller_id, register_id, limit = '10' } = req.query
  const { data, error } = await supabaseAdmin.rpc('report_range_products', {
    p_tenant_id: auth.tenantId, p_from: range.from, p_to: range.to,
    p_location_id: location_id || null,
    p_seller_id: seller_id || null,
    p_register_id: register_id || null,
  })
  if (error) return res.status(500).json({ error: error.message })
  // Agrupar filas planas (producto+presentación) al shape anidado existente
  const pm = {}
  ;(data || []).forEach(r => {
    if (!pm[r.product_name]) pm[r.product_name] = { product_id: null, product_name: r.product_name, total_qty: 0, total_revenue: 0, presentations: [] }
    const p = pm[r.product_name]
    p.total_qty += Number(r.total_qty || 0)
    p.total_revenue += Number(r.total_revenue || 0)
    p.presentations.push({ label: r.label, qty: Number(r.total_qty || 0), revenue: Number(r.total_revenue || 0) })
  })
  return res.status(200).json(
    Object.values(pm).sort((a, b) => b.total_revenue - a.total_revenue).slice(0, parseInt(limit))
  )
}

// Detalle común para vendedor y caja: summary + por hora + productos + facturas
async function rangeDetail(auth, { from, to, location_id, seller_id, register_id }) {
  const rpcParams = {
    p_tenant_id: auth.tenantId, p_from: from, p_to: to,
    p_location_id: location_id || null,
    p_seller_id: seller_id || null,
    p_register_id: register_id || null,
  }
  const bounds = bogotaDayBounds(from, to)
  let invQ = supabaseAdmin.from('invoices')
    .select('id, code, location_id, location_name, seller_name, cashier_name, register_name, total, status, pay_method, items, created_at, paid_at')
    .eq('tenant_id', auth.tenantId)
    .gte('created_at', bounds.start).lt('created_at', bounds.end)
    .order('created_at', { ascending: false }).limit(100)
  if (location_id) invQ = invQ.eq('location_id', location_id)
  if (seller_id)   invQ = invQ.eq('seller_id', seller_id)
  if (register_id) invQ = invQ.eq('register_id', register_id)

  const [sum, hours, prods, invs] = await Promise.all([
    supabaseAdmin.rpc('report_range_summary', rpcParams),
    supabaseAdmin.rpc('report_range_by_hour', rpcParams),
    supabaseAdmin.rpc('report_range_products', rpcParams),
    invQ,
  ])
  const s = sum.data?.[0] || {}
  const tr = Number(s.total_revenue || 0), ic = Number(s.invoice_count || 0)
  return {
    summary: {
      total_revenue: tr, invoice_count: ic,
      avg_ticket: ic > 0 ? tr / ic : 0,
      pending_count: Number(s.pending_count || 0),
      cancelled_count: Number(s.cancelled_count || 0),
      by_pay_method: { cash: Number(s.cash || 0), transfer: Number(s.transfer || 0), card: Number(s.card || 0) },
    },
    by_hour: (hours.data || []).map(h => ({ hour: h.hour, count: Number(h.invoice_count || 0), revenue: Number(h.total_revenue || 0) })),
    top_products: (prods.data || []).slice(0, 10).map(p => ({ name: `${p.product_name}${p.label && p.label !== 'Unidad' ? ` (${p.label})` : ''}`, qty: Number(p.total_qty || 0), revenue: Number(p.total_revenue || 0) })),
    invoices: invs.data || [],
  }
}

async function reportSellerDetail(req, res) {
  const auth = await requireAuth(req, res); if (!auth) return
  const { seller_id, location_id } = req.query
  if (!seller_id) return res.status(400).json({ error: 'seller_id requerido' })
  let range
  try { range = parseRange(req.query) } catch (e) { return res.status(e.status || 400).json({ error: e.message }) }
  const { data: seller } = await supabaseAdmin.from('sellers')
    .select('id, name, role').eq('id', seller_id).eq('tenant_id', auth.tenantId).single()
  const detail = await rangeDetail(auth, { from: range.from, to: range.to, location_id, seller_id })
  return res.status(200).json({
    seller: seller || { id: seller_id, name: 'Desconocido' },
    from: range.from, to: range.to, date: range.from === range.to ? range.from : undefined,
    ...detail,
  })
}

async function reportRegisterDetail(req, res) {
  const auth = await requireAuth(req, res); if (!auth) return
  const { register_id, location_id } = req.query
  if (!register_id) return res.status(400).json({ error: 'register_id requerido' })
  let range
  try { range = parseRange(req.query) } catch (e) { return res.status(e.status || 400).json({ error: e.message }) }
  const { data: register } = await supabaseAdmin.from('registers')
    .select('id, name, location_id').eq('id', register_id).eq('tenant_id', auth.tenantId).single()
  if (!register) return res.status(404).json({ error: 'Caja no encontrada' })
  const detail = await rangeDetail(auth, { from: range.from, to: range.to, location_id, register_id })
  return res.status(200).json({
    register, from: range.from, to: range.to,
    ...detail,
  })
}
```

- [ ] **Step 3: `invoicesHistory` con rango**

Reemplazar el cálculo de `day/dayEnd` por:

```js
  let range
  try { range = parseRange(req.query) } catch (e) { return res.status(e.status || 400).json({ error: e.message }) }
  const bounds = bogotaDayBounds(range.from, range.to)
```

y usar `.gte('created_at', bounds.start).lt('created_at', bounds.end)` en el query (resto del handler sin cambios).

- [ ] **Step 4: Verificar** — `npm test && npm run build`. Grep de seguridad: `grep -n "rpc('report_range" "api/[[...path]].js"` → toda llamada lleva `p_tenant_id: auth.tenantId`.

- [ ] **Step 5: Commit**

```bash
git add "api/[[...path]].js"
git commit -m "feat(api): reportes por rango via RPC, register-detail y historial con desde/hasta"
```

---

### Task 4: Cierre del ledger — API

**Files:**
- Create: `api/_lib/tenantOwns.js`
- Modify: `api/[[...path]].js` (aplicar tenantOwns; /public/tenant match exacto; comentario Vary)
- Modify: `api/_lib/superRoutes.js` (DUMMY_HASH precomputado; validaciones PATCH; metrics con rango Bogotá; list "hoy" Bogotá)

**Interfaces:**
- Produces: `tenantOwns(table, id, tenantId) → Promise<boolean>` (true si `id` es null/undefined — refs opcionales ausentes son válidas).
- Consumes: `parseRange`, `bogotaDayBounds`, `bogotaDate` (Task 2).

- [ ] **Step 1: Crear `api/_lib/tenantOwns.js`**

```js
import { supabaseAdmin } from './supabaseAdmin.js'

/**
 * Verifica que una fila referenciada desde el body pertenezca al tenant del token.
 * Un id ausente (null/undefined) se considera válido — la referencia es opcional.
 */
export async function tenantOwns(table, id, tenantId) {
  if (!id) return true
  const { data } = await supabaseAdmin.from(table).select('id').eq('id', id).eq('tenant_id', tenantId).single()
  return !!data
}
```

- [ ] **Step 2: Aplicar en `api/[[...path]].js`** (import junto a los demás). Mensaje uniforme: `403 { error: 'Referencia inválida para esta empresa' }`.

- `registersCreate`: tras validar body → `if (!(await tenantOwns('locations', location_id, auth.tenantId))) return res.status(403).json({ error: 'Referencia inválida para esta empresa' })`
- `sellersCreate` y `sellersUpdate`: antes de insertar `seller_locations`, validar cada id: `for (const lid of location_ids) { if (!(await tenantOwns('locations', lid, auth.tenantId))) return res.status(403).json(...) }`
- `productsCreate` y `productsUpdate`: validar `category_id` (si viene) con `tenantOwns('categories', ...)`.
- `invoicesCreate`: validar `seller_id` con `tenantOwns('sellers', ...)` (el location ya se valida).

- [ ] **Step 3: `/public/tenant` match exacto** — en el router, cambiar la condición agregando `&& segments.length === 3`.

- [ ] **Step 4: Comentario Vary en `productsGet`** — encima de los dos `setHeader`:

```js
  // Respuesta por-tenant en URL compartida: private evita CDNs compartidos y
  // Vary: Authorization separa las entradas por token (HTTP y Cache API del SW).
  // Cualquier endpoint /api futuro con max-age > 0 debe replicar este par.
```

- [ ] **Step 5: `api/_lib/superRoutes.js`**

1. `DUMMY_HASH`: reemplazar `bcrypt.hashSync(...)` por constante literal. Generarla con `node -e "console.log(require('bcryptjs').hashSync('pyroventa-dummy', 10))"` y pegar:

```js
// Hash bcrypt (costo 10) precomputado de 'pyroventa-dummy' — iguala el tiempo de
// respuesta cuando el email no existe sin pagar el hash en cada cold start.
const DUMMY_HASH = '<pegar hash generado>'
```

2. `superTenantsPatch`: después de armar `u`, agregar:

```js
  if (u.name !== undefined && !String(u.name).trim()) return res.status(400).json({ error: 'El nombre no puede estar vacío' })
  if ((u.license_start ?? u.license_end) !== undefined) {
    const { data: current } = await supabaseAdmin.from('tenants').select('license_start, license_end').eq('id', id).single()
    const start = u.license_start ?? current?.license_start
    const end   = u.license_end   ?? current?.license_end
    if (start && end && end < start) return res.status(400).json({ error: 'license_end debe ser posterior a license_start' })
  }
```

3. `superMetrics`: reemplazar el cálculo de fechas por `parseRange` + `bogotaDayBounds` (import de `./range.js`); usar `bounds.start`/`bounds.end` en gte/lt; try/catch → 400. Agregar `from`/`to` al JSON de respuesta: `return res.status(200).json({ from: range.from, to: range.to, tenants: [...] })` — **OJO**: el shape cambia de array a objeto; Task 7 construye la UI contra este shape nuevo (no hay consumidor previo).

4. `superTenantsList`: reemplazar `const today = new Date(); today.setHours(0,0,0,0)` por:

```js
  const hoy = bogotaDate()
  const { start: todayStart } = bogotaDayBounds(hoy, hoy)
```

y usar `.gte('created_at', todayStart)` (imports desde `./range.js` y `./tenantStatus.js`).

- [ ] **Step 6: Verificar y commit**

```bash
npm test && npm run build
git add api/_lib/tenantOwns.js api/_lib/superRoutes.js "api/[[...path]].js"
git commit -m "fix(api): tenantOwns en refs del body, validaciones super admin, cortes Bogota y hardening"
```

---

### Task 5: Frontend base — exportExcel, DateRangeBar, DailyTrend

**Files:**
- Create: `src/lib/exportExcel.js`
- Create: `src/components/DateRangeBar.jsx`
- Create: `src/components/DailyTrend.jsx`

**Interfaces:**
- Produces: `exportToExcel(sheets, filename)` — `sheets: [{ name, rows: object[] }]`; import dinámico de `xlsx`.
- Produces: `<DateRangeBar from to onChange(from, to) />` — inputs desde/hasta + atajos Hoy / 7 días / 30 días.
- Produces: `<DailyTrend data />` — `data: [{ day, total_revenue, invoice_count, cash, transfer, card }]`; retorna null si `data.length < 2`.

- [ ] **Step 1: `src/lib/exportExcel.js`**

```js
// Export XLSX con import dinámico (no engorda el bundle inicial).
// sheets: [{ name: 'Resumen', rows: [{Columna: valor, ...}, ...] }, ...]
// Los valores numéricos van crudos para que Excel los trate como números.
export async function exportToExcel(sheets, filename) {
  const XLSX = await import('xlsx')
  const wb = XLSX.utils.book_new()
  for (const sheet of sheets) {
    if (!sheet.rows?.length) continue
    const ws = XLSX.utils.json_to_sheet(sheet.rows)
    XLSX.utils.book_append_sheet(wb, ws, sheet.name.slice(0, 31))
  }
  XLSX.writeFile(wb, filename)
}
```

- [ ] **Step 2: `src/components/DateRangeBar.jsx`**

```jsx
// Selector de rango con atajos. Fechas en hora local del dispositivo (Colombia).
const toISO = (d) => {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export default function DateRangeBar({ from, to, onChange }) {
  const setQuick = (days) => {
    const end = new Date()
    const start = new Date()
    start.setDate(start.getDate() - (days - 1))
    onChange(toISO(start), toISO(end))
  }

  return (
    <div className="flex items-end gap-3 flex-wrap">
      <div>
        <label className="block text-xs text-gray-600 mb-1">Desde</label>
        <input type="date" value={from} max={to}
          onChange={e => onChange(e.target.value, to < e.target.value ? e.target.value : to)}
          className="input w-40 text-sm" />
      </div>
      <div>
        <label className="block text-xs text-gray-600 mb-1">Hasta</label>
        <input type="date" value={to} min={from}
          onChange={e => onChange(from > e.target.value ? e.target.value : from, e.target.value)}
          className="input w-40 text-sm" />
      </div>
      <div className="flex gap-1.5">
        <button onClick={() => setQuick(1)}  className="btn btn-ghost btn-sm border border-white/10">Hoy</button>
        <button onClick={() => setQuick(7)}  className="btn btn-ghost btn-sm border border-white/10">7 días</button>
        <button onClick={() => setQuick(30)} className="btn btn-ghost btn-sm border border-white/10">30 días</button>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: `src/components/DailyTrend.jsx`**

```jsx
import { formatCOP } from '../lib/format.js'

// Tendencia día por día con barra proporcional al mejor día.
// data: [{ day: 'YYYY-MM-DD', total_revenue, invoice_count, cash, transfer, card }]
export default function DailyTrend({ data, loading }) {
  if (loading) {
    return <div className="space-y-2">{[1, 2, 3].map(i => <div key={i} className="skeleton h-10 rounded-xl" />)}</div>
  }
  if (!data || data.length < 2) return null

  const max = Math.max(...data.map(d => d.total_revenue), 1)

  return (
    <div className="card bg-surface-300 overflow-x-auto">
      <table className="w-full text-sm min-w-[560px]">
        <thead>
          <tr className="text-left text-xs text-gray-600">
            <th className="py-1.5 pr-3 font-medium">Día</th>
            <th className="py-1.5 pr-3 font-medium text-right">Facturas</th>
            <th className="py-1.5 pr-3 font-medium text-right">Efectivo</th>
            <th className="py-1.5 pr-3 font-medium text-right">Transf.</th>
            <th className="py-1.5 pr-3 font-medium text-right">Tarjeta</th>
            <th className="py-1.5 pr-3 font-medium text-right">Total</th>
            <th className="py-1.5 w-32" />
          </tr>
        </thead>
        <tbody>
          {data.map(d => (
            <tr key={d.day} className="border-t border-white/5">
              <td className="py-1.5 pr-3 font-mono text-gray-300">{d.day}</td>
              <td className="py-1.5 pr-3 text-right text-gray-400">{d.invoice_count}</td>
              <td className="py-1.5 pr-3 text-right font-mono text-green-400/80">{formatCOP(d.cash)}</td>
              <td className="py-1.5 pr-3 text-right font-mono text-blue-400/80">{formatCOP(d.transfer)}</td>
              <td className="py-1.5 pr-3 text-right font-mono text-violet-400/80">{formatCOP(d.card)}</td>
              <td className="py-1.5 pr-3 text-right font-mono font-semibold text-brand-400">{formatCOP(d.total_revenue)}</td>
              <td className="py-1.5">
                <div className="h-1.5 bg-surface-50 rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-brand-600 to-brand-400 rounded-full"
                    style={{ width: `${(d.total_revenue / max) * 100}%` }} />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 4: Verificar y commit**

```bash
npm run build && npm test
git add src/lib/exportExcel.js src/components/DateRangeBar.jsx src/components/DailyTrend.jsx
git commit -m "feat(front): exportExcel, DateRangeBar y DailyTrend"
```

---

### Task 6: AdminPage — Resumen e Historial con rango + export

**Files:**
- Modify: `src/pages/AdminPage.jsx` (estado `date` → `from`/`to`; ResumenTab; HistorialTab)

**Interfaces:**
- Consumes: `DateRangeBar`, `DailyTrend`, `exportToExcel` (Task 5); endpoints con `from`/`to` (Task 3).
- Produces: `ResumenTab` y `SellerStats` reciben `from`/`to` (Task 7 actualiza SellerStats/SellerDetailModal para consumirlos).

- [ ] **Step 1: Estado de AdminPage** — reemplazar `const [date, setDate] = useState(...)` por:

```jsx
  const hoy = new Date().toISOString().split('T')[0]
  const [from, setFrom] = useState(hoy)
  const [to,   setTo]   = useState(hoy)
```

y pasar `from`, `to`, `setRange={(f, t) => { setFrom(f); setTo(t) }}` a `ResumenTab` (quitar `date`/`setDate`).

- [ ] **Step 2: ResumenTab** — cambios:

1. Firma: `function ResumenTab({ from, to, setRange, locationId, setLocationId, locations })`.
2. `fetchAll`: `const q = \`?from=${from}&to=${to}${locParam}\`` con deps `[from, to, locationId]`; la llamada a `/reports/locations` usa `?from=${from}&to=${to}`.
3. Reemplazar el input de fecha del bloque Filtros por `<DateRangeBar from={from} to={to} onChange={setRange} />` (dejando el select de punto de venta y el botón Actualizar dentro del mismo contenedor flex).
4. Título de métricas: `Métricas del día` → `` {from === to ? 'Métricas del día' : `Métricas · ${from} → ${to}`} ``.
5. Sección nueva después de Métricas:

```jsx
      {daily?.by_day?.length > 1 && (
        <section>
          <h2 className="font-syne font-semibold text-white mb-4">📈 Ventas por día</h2>
          <DailyTrend data={daily.by_day} loading={loadDaily} />
        </section>
      )}
```

6. `<SellerStats ... date={date}` → `from={from} to={to}` (mantener `locationId`).
7. `<RegisterComparison data={regCompar} loading={loadRegs} />` → `<RegisterComparison data={regCompar} loading={loadRegs} from={from} to={to} locationId={locationId} />` (Task 7 los consume).
8. Botón Exportar junto a Actualizar:

```jsx
        <button onClick={handleExport} className="btn btn-ghost border border-white/10">
          ⬇ Exportar
        </button>
```

con el handler dentro de ResumenTab:

```jsx
  const handleExport = () => {
    const sheets = [
      { name: 'Resumen', rows: daily ? [{
          Desde: from, Hasta: to,
          'Total vendido': daily.total_revenue, Facturas: daily.invoice_count,
          'Ticket promedio': Math.round(daily.avg_ticket), Pendientes: daily.pending_count,
          Canceladas: daily.cancelled_count, Efectivo: daily.by_pay_method.cash,
          Transferencia: daily.by_pay_method.transfer, Tarjeta: daily.by_pay_method.card,
        }] : [] },
      { name: 'Por día', rows: (daily?.by_day || []).map(d => ({
          Día: d.day, Facturas: d.invoice_count, Efectivo: d.cash,
          Transferencia: d.transfer, Tarjeta: d.card, Total: d.total_revenue })) },
      { name: 'Vendedores', rows: sellers.map(s => ({
          Vendedor: s.seller_name, Facturas: s.count, Efectivo: s.by_method.cash,
          Transferencia: s.by_method.transfer, Tarjeta: s.by_method.card, Total: s.total })) },
      { name: 'Cajas', rows: regCompar.map(r => ({
          Caja: r.register_name, Cajero: r.cashier_name || '', Facturas: r.count,
          Efectivo: r.by_method.cash, Transferencia: r.by_method.transfer,
          Tarjeta: r.by_method.card, Total: r.total })) },
      { name: 'Productos', rows: topProds.flatMap(p => p.presentations.map(pr => ({
          Producto: p.product_name, Presentación: pr.label, Cantidad: pr.qty, Total: pr.revenue }))) },
    ]
    exportToExcel(sheets, `pyroventa_${from}_${to}.xlsx`)
  }
```

Imports nuevos en AdminPage: `DateRangeBar`, `DailyTrend`, `exportToExcel`.

- [ ] **Step 3: HistorialTab** — reemplazar el estado `date` por `from`/`to` (default hoy), el input de fecha por dos inputs desde/hasta (mismo patrón que DateRangeBar pero inline, o reusar `DateRangeBar`), y en `fetchInvoices` construir `new URLSearchParams({ from, to })`. Deps del useCallback: `[from, to, locFilter, statusFilt]`.

- [ ] **Step 4: Verificar y commit**

```bash
npm run build && npm test
git add src/pages/AdminPage.jsx
git commit -m "feat(front): resumen e historial con rango de fechas, tendencia diaria y export XLSX"
```

---

### Task 7: Detalle por caja + rango en modales de vendedor

**Files:**
- Create: `src/components/RegisterDetailModal.jsx`
- Modify: `src/components/RegisterComparison.jsx`
- Modify: `src/components/SellerDetailModal.jsx`
- Modify: `src/components/SellerStats.jsx`

**Interfaces:**
- Consumes: `GET /reports/register-detail?register_id&from&to&location_id` (shape: `{ register, summary, by_hour, top_products, invoices }`); `GET /reports/seller-detail` con `from`/`to`.
- Produces: `<RegisterDetailModal registerId registerName from to locationId onClose />`; `SellerDetailModal` cambia prop `date` → `from`/`to`; `SellerStats` recibe y propaga `from`/`to`; `RegisterComparison` recibe `from`/`to`/`locationId` y abre el modal al hacer click.

- [ ] **Step 1: `src/components/RegisterDetailModal.jsx`** — copiar la estructura de `SellerDetailModal.jsx` (KPIs, chips por método, timeline por hora, productos, lista de facturas expandibles — el JSX interno es idéntico, mismos nombres de campos) con estas diferencias:

1. Props: `{ registerId, registerName, from, to, locationId, onClose }`.
2. Fetch: `params = new URLSearchParams({ register_id: registerId, from, to })`; `if (locationId) params.set('location_id', locationId)`; `api.get('/reports/register-detail?...')`.
3. Header: título `🖥 {registerName}`, subtítulo `Detalle de caja · {from === to ? from : `${from} → ${to}`}`.
4. En la lista de facturas, mostrar `inv.seller_name` (quién vendió) en lugar de `inv.location_name` como línea secundaria: `<p className="text-[10px] text-gray-600 mt-0.5">Vendió: {inv.seller_name}</p>`.
5. Botón export en el header (icono ⬇), con:

```jsx
  const handleExport = () => {
    if (!data) return
    exportToExcel([
      { name: 'Resumen', rows: [{ Caja: registerName, Desde: from, Hasta: to,
          Total: data.summary.total_revenue, Facturas: data.summary.invoice_count,
          Efectivo: data.summary.by_pay_method.cash, Transferencia: data.summary.by_pay_method.transfer,
          Tarjeta: data.summary.by_pay_method.card }] },
      { name: 'Productos', rows: (data.top_products || []).map(p => ({ Producto: p.name, Cantidad: p.qty, Total: p.revenue })) },
      { name: 'Facturas', rows: (data.invoices || []).map(i => ({ Código: i.code, Estado: i.status,
          Vendedor: i.seller_name, Método: i.pay_method || '', Total: i.total, Fecha: i.created_at })) },
    ], `caja_${registerName}_${from}_${to}.xlsx`)
  }
```

- [ ] **Step 2: `RegisterComparison.jsx`** — leer el archivo; cambios: firma `({ data, loading, from, to, locationId })`; estado `const [selected, setSelected] = useState(null)`; envolver cada card de caja en `<button onClick={() => setSelected(r)}>` (mismo patrón que SellerStats, agregando la línea `Click para ver detalle →`); al final renderizar:

```jsx
      {selected && (
        <RegisterDetailModal
          registerId={selected.register_id}
          registerName={selected.register_name}
          from={from} to={to} locationId={locationId}
          onClose={() => setSelected(null)}
        />
      )}
```

Nota: cajas con `register_id === null` ("Sin caja") NO son clickeables — renderizarlas como `<div>` sin onClick.

- [ ] **Step 3: `SellerDetailModal.jsx`** — props `date` → `{ sellerId, sellerName, from, to, locationId, onClose }`; el fetch envía `from`/`to`; subtítulo `Detalle de ventas · {from === to ? from : `${from} → ${to}`}`; deps del useEffect `[sellerId, from, to, locationId]`. Agregar botón export en el header (misma estructura que el de caja, hojas Resumen/Productos/Facturas con `Vendedor: sellerName`).

- [ ] **Step 4: `SellerStats.jsx`** — firma `({ data, loading, from, to, locationId })`; pasar `from={from} to={to}` al `SellerDetailModal`.

- [ ] **Step 5: Verificar y commit**

```bash
npm run build && npm test
git add src/components/RegisterDetailModal.jsx src/components/RegisterComparison.jsx src/components/SellerDetailModal.jsx src/components/SellerStats.jsx
git commit -m "feat(front): detalle por caja con export y modales de vendedor con rango"
```

---

### Task 8: SuperDashboard — métricas por rango, slug editable, Copiado, chip ámbar

**Files:**
- Modify: `src/pages/SuperDashboard.jsx`

**Interfaces:**
- Consumes: `GET /super/metrics?from&to` → `{ from, to, tenants: [{ tenant_id, tenant_name, revenue, invoice_count }] }` (shape de Task 4); `POST /super/tenants` acepta `slug` en el body (ya soportado por la API).

- [ ] **Step 1: Chip ámbar** — en `STATUS_UNKNOWN`, cambiar las clases grises por `'bg-amber-500/15 text-amber-400 border-amber-500/30'` y dejar `LICENSE_NOT_STARTED` gris (quedan distinguibles).

- [ ] **Step 2: Feedback "Copiado"** — en `NewTenantModal`, estado `const [copied, setCopied] = useState(false)`; el botón de copiar:

```jsx
              <button onClick={() => {
                navigator.clipboard.writeText(fullLink)
                  .then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) })
                  .catch(() => {})
              }} className="btn btn-ghost btn-sm shrink-0">
                {copied ? <span className="text-green-400 text-xs">Copiado ✓</span> : <Copy className="w-4 h-4" />}
              </button>
```

- [ ] **Step 3: Slug editable en el wizard** — en `NewTenantModal`: estado `slug` + helper local (misma lógica que el backend):

```jsx
const slugify = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/, '')
```

- Estado: `const [slug, setSlug] = useState('')` y `const [slugTouched, setSlugTouched] = useState(false)`.
- El input de nombre además hace: `if (!slugTouched) setSlug(slugify(e.target.value))`.
- Input nuevo bajo el nombre:

```jsx
            <div>
              <label className="text-gray-400 text-sm block mb-1.5">Código (slug) — será el link /c/&lt;código&gt;</label>
              <input value={slug}
                onChange={e => { setSlugTouched(true); setSlug(slugify(e.target.value)) }}
                placeholder="pirotecnia-el-coheton"
                className="w-full px-4 py-2.5 rounded-xl bg-surface-400 border-2 border-white/10 text-white font-mono text-sm focus:border-brand-500 focus:outline-none" />
            </div>
```

- En `handleSubmit`: `const body = { name, slug, license_start: start, license_end: end }`.

- [ ] **Step 4: Sección de métricas por rango** — componente nuevo en el mismo archivo:

```jsx
function MetricsSection() {
  const hoy = new Date().toISOString().split('T')[0]
  const [from, setFrom] = useState(hoy)
  const [to,   setTo]   = useState(hoy)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)

  const load = async () => {
    setLoading(true)
    try { setData(await superApi.get(`/super/metrics?from=${from}&to=${to}`)) }
    catch { setData(null) }
    finally { setLoading(false) }
  }
  useEffect(() => { load() /* eslint-disable-line */ }, []) // carga inicial (hoy)

  return (
    <div className="mt-8">
      <h2 className="font-syne text-xl font-bold text-white mb-3">Métricas globales</h2>
      <div className="flex items-end gap-2 flex-wrap mb-3">
        <input type="date" value={from} max={to} onChange={e => setFrom(e.target.value)}
          className="px-3 py-2 rounded-xl bg-surface-400 border border-white/10 text-white text-sm" />
        <span className="text-gray-600 pb-2">→</span>
        <input type="date" value={to} min={from} onChange={e => setTo(e.target.value)}
          className="px-3 py-2 rounded-xl bg-surface-400 border border-white/10 text-white text-sm" />
        <button onClick={load} disabled={loading} className="btn btn-primary btn-sm">
          {loading ? <Loader2 className="animate-spin h-4 w-4" /> : 'Consultar'}
        </button>
      </div>
      {data?.tenants?.length > 0 ? (
        <div className="card bg-surface-300 border-white/8 overflow-x-auto">
          <table className="w-full text-sm min-w-[420px]">
            <thead>
              <tr className="text-left text-xs text-gray-600">
                <th className="py-1.5 pr-3 font-medium">Cliente</th>
                <th className="py-1.5 pr-3 font-medium text-right">Facturas</th>
                <th className="py-1.5 font-medium text-right">Total vendido</th>
              </tr>
            </thead>
            <tbody>
              {data.tenants.map(t => (
                <tr key={t.tenant_id} className="border-t border-white/5">
                  <td className="py-1.5 pr-3 text-white">{t.tenant_name}</td>
                  <td className="py-1.5 pr-3 text-right text-gray-400">{t.invoice_count}</td>
                  <td className="py-1.5 text-right font-mono text-brand-400">{formatCOP(t.revenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-gray-600 text-sm">{loading ? 'Cargando…' : 'Sin ventas en el rango.'}</p>
      )}
    </div>
  )
}
```

Renderizar `<MetricsSection />` al final del contenedor principal de `SuperDashboard` (después de la lista de tenants, antes del modal).

- [ ] **Step 5: Verificar y commit**

```bash
npm run build && npm test
git add src/pages/SuperDashboard.jsx
git commit -m "feat(front): metricas por rango, slug editable, feedback copiado y chip ambar en panel super"
```

---

### Task 9: LoginPage/authStore — await de caché y classifyBootstrapError

**Files:**
- Modify: `src/store/authStore.js`
- Modify: `src/pages/LoginPage.jsx`

**Interfaces:**
- Consumes: `classifyBootstrapError` (Task 2).
- Produces: `login(...)` retorna Promise (resuelta cuando la caché API del SW está limpia).

- [ ] **Step 1: `authStore.js`** — `login` retorna la promesa de limpieza:

```js
      login: (seller, location, tenant, token) => {
        localStorage.setItem('pv_token', token)
        if (tenant?.slug) localStorage.setItem('pv_tenant_slug', tenant.slug)
        set({ seller, location, tenant, token, register: null })
        // Limpiar cachés de API del SW ANTES de que el caller navegue,
        // para que la primera pantalla no sirva datos de otro tenant.
        if (typeof caches !== 'undefined') {
          return caches.keys()
            .then(keys => Promise.all(keys.filter(k => k.includes('api')).map(k => caches.delete(k))))
            .catch(() => {})
        }
        return Promise.resolve()
      },
```

- [ ] **Step 2: `LoginPage.jsx`**

1. `handleLogin`: `login(...)` → `await login(data.seller, data.location, data.tenant, data.token)`.
2. Import `classifyBootstrapError` y reemplazar el catch de `loadTenant`:

```jsx
    } catch (err) {
      const { clearSlug, message } = classifyBootstrapError(err)
      if (clearSlug) {
        localStorage.removeItem('pv_tenant_slug')
        setTenant(null)
      }
      toastError(message)
      setStep('company')
    } finally {
```

- [ ] **Step 3: Verificar y commit**

```bash
npm run build && npm test
git add src/store/authStore.js src/pages/LoginPage.jsx
git commit -m "fix(front): login espera limpieza de cache SW y bootstrap usa classifyBootstrapError"
```

---

### Task 10: Review final de la rama y fixes

- [ ] **Step 1:** Review de rama completa (spec vs. implementación, integración cross-task: shapes consumidos por DailyMetrics/TopProducts/LocationComparison intactos, ningún caller sigue enviando solo `date` donde importe, RPCs con `p_tenant_id` siempre).
- [ ] **Step 2:** Fix de hallazgos Critical/Important en un solo commit.
- [ ] **Step 3:** Actualizar `.superpowers/sdd/progress.md` (sección nueva `2026-07-13 reportes+ledger`) y marcar los 14 ítems del ledger multitenant como cerrados.

## Self-Review (ejecutada al escribir el plan)

- **Cobertura del spec**: 7 RPCs (Task 1); parseRange/bogotaDayBounds/bogotaDate (Task 2); 6 endpoints + register-detail + history rango (Task 3); 14 ítems del ledger → Task 2 (hoists, jwt, classify), Task 4 (tenantOwns, match exacto, DUMMY_HASH, validaciones super, cortes Bogotá, Vary), Task 8 (metrics UI, slug, Copiado, ámbar), Task 9 (await caché, consumo classify). Export XLSX (Tasks 5-7). Frontend rango (Tasks 6-8).
- **Placeholders**: solo el hash DUMMY (generado por el implementador con comando dado) — intencional.
- **Consistencia**: shapes RPC→handler→componente verificados contra el código leído (SellerStats usa `total/count/by_method`; SellerDetailModal usa `summary.by_pay_method/by_hour[].count/top_products[].name`); `superMetrics` cambia de shape y su único consumidor (MetricsSection) se construye en Task 8 contra el shape nuevo.
