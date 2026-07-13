# PyroVenta — Reportes por rango de fechas + cierre del ledger

**Fecha:** 2026-07-13
**Estado:** Aprobado por el usuario
**Base:** master local en `59c4b57` (multitenant completo, Task 11 de deploy aún pendiente — el schema de producción NO se ha aplicado, por lo que los cambios SQL van directo a `supabase/schema.sql` sin migración).

## Objetivo

1. **Reportes detallados**: todos los reportes aceptan rango de fechas (desde/hasta) con desglose día por día, detalle por caja equivalente al de vendedor, desglose de productos por vendedor/caja, y exportación a Excel.
2. **Cierre del ledger**: implementar los 14 pendientes menores registrados en `.superpowers/sdd/progress.md` de la conversión multitenant.

## Decisiones tomadas

| Decisión | Elección |
|---|---|
| Agregación por rango | **En SQL (funciones RPC en Postgres)** — la agregación JS actual se elimina; evita el límite de 1.000 filas de PostgREST y transferencias grandes |
| Zona horaria de reportes | Todos los cortes de día en `America/Bogota` (consistente con la vigencia de licencias; corrige el desfase UTC actual) |
| Compatibilidad | Los endpoints conservan el parámetro `date` (equivale a `from=to=date`) |
| Gráficos | Sin librería de charts: tabla día-por-día con barras CSS simples |
| Export | XLSX con la dependencia `xlsx` ya instalada |

## 1. Funciones SQL (agregar a `supabase/schema.sql`)

Convención común:

- Todas reciben `p_tenant_id UUID NOT NULL`, `p_from DATE`, `p_to DATE` (ambos inclusivos, interpretados como fechas de Bogotá).
- El corte de día se calcula con `(created_at AT TIME ZONE 'America/Bogota')::date BETWEEN p_from AND p_to`.
- Filtros opcionales con default `NULL` (ignorados si son NULL): `p_location_id`, `p_seller_id`, `p_register_id` según tabla de abajo.
- Solo facturas `status = 'paid'` cuentan para revenue/counts, EXCEPTO `report_range_summary` que además devuelve `pending_count` y `cancelled_count` del rango.
- `LANGUAGE sql STABLE`.

| Función | Retorna (TABLE) | Filtros opcionales |
|---|---|---|
| `report_range_summary` | `total_revenue NUMERIC, invoice_count BIGINT, pending_count BIGINT, cancelled_count BIGINT, cash NUMERIC, transfer NUMERIC, card NUMERIC` (1 fila) | location, seller, register |
| `report_range_by_day` | `day DATE, total_revenue NUMERIC, invoice_count BIGINT, cash NUMERIC, transfer NUMERIC, card NUMERIC` (1 fila/día con ventas) | location, seller, register |
| `report_range_by_seller` | `seller_id UUID, seller_name TEXT, total_revenue NUMERIC, invoice_count BIGINT, cash NUMERIC, transfer NUMERIC, card NUMERIC` | location |
| `report_range_by_register` | `register_id UUID, register_name TEXT, cashier_name TEXT, total_revenue NUMERIC, invoice_count BIGINT, cash NUMERIC, transfer NUMERIC, card NUMERIC` | location |
| `report_range_by_location` | `location_id UUID, location_name TEXT, total_revenue NUMERIC, invoice_count BIGINT, pending_count BIGINT, cancelled_count BIGINT, cash NUMERIC, transfer NUMERIC, card NUMERIC` | — |
| `report_range_products` | `product_name TEXT, label TEXT, total_qty BIGINT, total_revenue NUMERIC` (por producto+presentación, vía `jsonb_array_elements(items)`; usa `item->>'product_name'` con fallback a `item->>'label'`) | location, seller, register |
| `report_range_by_hour` | `hour TEXT ('HH24:00' hora Bogotá), invoice_count BIGINT, total_revenue NUMERIC` | location, seller, register |

Notas:
- `register_name`/`cashier_name`/`seller_name`/`location_name` salen de los snapshots de `invoices` (agrupando por id, tomando `max(name)`), igual que la lógica JS actual.
- Los items JSONB usan las claves existentes del snapshot: `product_name`, `label`, `qty`, `subtotal`.

## 2. API (`api/[[...path]].js`)

### Resolución de rango (helper compartido)

`parseRange(req.query)` → `{ from, to }`:
- Si vienen `from` y `to` (formato `YYYY-MM-DD`) se usan; si `to < from` → 400.
- Si viene solo `date` → `from = to = date`.
- Si no viene nada → hoy en Bogotá (mismo cálculo que `tenantStatus`).

### Endpoints (todos con `requireAuth`, todos pasan `auth.tenantId` a las RPC)

| Ruta | Cambio |
|---|---|
| `GET /reports/daily` | RPC `summary`; si `from !== to` agrega `by_day` (RPC by_day); si no hay `location_id` agrega `by_location` (RPC by_location). Shape: `{ from, to, total_revenue, invoice_count, avg_ticket, pending_count, cancelled_count, by_pay_method: {cash,transfer,card}, by_day: [...], by_location: [...] }` — conserva los nombres de campos actuales donde existen |
| `GET /reports/sellers` | RPC by_seller; shape actual (`by_method`, `avg_ticket` calculado en JS trivial) |
| `GET /reports/registers` | RPC by_register; shape actual |
| `GET /reports/locations` | RPC by_location; shape actual |
| `GET /reports/top-products` | RPC products + `limit`; gana filtros opcionales `seller_id`, `register_id` |
| `GET /reports/seller-detail` | RPCs summary + by_hour + products (todas con `p_seller_id`) + lista de facturas (select paginado tenant-scoped, `order created_at desc`, `limit 100`); shape actual (`summary`, `by_hour`, `top_products`, `invoices`) con `date` → `{from, to}` |
| `GET /reports/register-detail` **(NUEVO)** | Espejo exacto de seller-detail con `p_register_id` y `register: {id, name}` (lookup en `registers` tenant-scoped) |
| `GET /invoices/history` | Acepta `from`/`to` además de `date` (ya está paginado con `limit/offset` y `count exact` — sin riesgo de corte) |

La agregación JavaScript de los 6 handlers actuales se elimina.

## 3. Frontend

### ResumenTab (`src/pages/AdminPage.jsx`)
- El input de fecha única se reemplaza por **desde/hasta** + atajos: `Hoy`, `7 días`, `30 días` (componente `DateRangeBar` nuevo en `src/components/`).
- Card nueva **"Ventas por día"** (`src/components/DailyTrend.jsx`): tabla con columnas Día / Facturas / Efectivo / Transf. / Tarjeta / Total, con barra CSS proporcional al total del mejor día. Solo se muestra si `by_day` viene con más de 1 fila.
- Botón **"Exportar"**: genera un XLSX con hojas Resumen, Por día, Vendedores, Cajas, Productos (datos ya cargados en el tab, sin requests extra).

### CajasTab
- Cada caja gana botón "Ver detalle" que abre **`RegisterDetailModal`** (`src/components/RegisterDetailModal.jsx`): espejo estructural de `SellerDetailModal` — resumen del rango, ventas por hora, productos vendidos, lista de facturas cobradas. Botón export (1 hoja).

### VendedoresTab / SellerDetailModal
- Pasan de fecha única a rango (mismos props `from`/`to`). Export (1 hoja) en el modal.

### HistorialTab
- Filtro pasa a rango desde/hasta. El detalle de líneas por venta ya existe (`InvoiceDetail`) — sin cambios ahí.

### Export (`src/lib/exportExcel.js`)
```js
exportToExcel(sheets, filename)
// sheets: [{ name: 'Resumen', rows: [{...}, ...] }, ...]
// import dinámico de 'xlsx' (no engordar el bundle inicial), aoa/json_to_sheet, writeFile
```
Formato de moneda: valores numéricos crudos (sin formatear) para que Excel los trate como números.

## 4. Cierre del ledger (14 ítems)

### Integridad / seguridad (API)
1. **`tenantOwns`** — helper en `api/_lib/tenantOwns.js`: `tenantOwns(table, id, tenantId) → Promise<boolean>` (select id scoped). Aplicar en: `registersCreate` (location_id), `sellersCreate` y `sellersUpdate` (cada location_id del array), `productsCreate` y `productsUpdate` (category_id si viene), `invoicesCreate` (seller_id). Respuesta al fallar: 403 `{ error: 'Referencia inválida para esta empresa' }`.
2. **`/public/tenant/:slug`** — match exacto: rechazar si `segments.length !== 3`.
3. **jwt.js** — `jwtVerify(token, secret(), { algorithms: ['HS256'] })` + test nuevo del default '7d' (verificar claim `exp ≈ iat + 7*86400`).
4. **superRoutes.js** — `DUMMY_HASH` pasa a constante string precomputada (hash bcrypt cost 10 literal, comentado) — elimina ~100ms de cold start.

### Super admin
5. **Métricas por rango en SuperDashboard** — sección nueva con desde/hasta que llama `GET /super/metrics?from&to` y muestra tabla por cliente (revenue, # facturas). Cierra el endpoint hoy sin UI.
6. **Wizard**: campo **slug editable** (se autogenera del nombre con la misma lógica slugify en el cliente, editable antes de crear; se envía en el body).
7. **`superTenantsPatch`**: rechazar `license_end < license_start` (400) y `name` vacío (400).
8. **`superMetrics`**: `to < from` → 400; corte de día en hora Bogotá (helper compartido con reports).
9. **`superTenantsList`**: "ventas de hoy" con corte Bogotá (usa el mismo helper).
10. **SuperDashboard**: feedback "Copiado ✓" (estado local 2s) en el botón de copiar link; chip `Desconocido` en ámbar (distinto de `LICENSE_NOT_STARTED` gris).

### Frontend / robustez
11. **`authStore.login`** devuelve la promesa de limpieza de caché SW; `LoginPage.handleLogin` la espera (`await`) antes de `navigate`.
12. **`classifyBootstrapError(err)`** — helper puro en `src/lib/bootstrapError.js`: recibe el error y retorna `{ clearSlug: boolean, message: string }` (404/403 → clearSlug + err.message; 5xx → conservar + 'Error del servidor — reintenta en un momento'; sin status → conservar + `err.message` de red). `loadTenant` lo consume. Tests vitest de las 3 ramas (cubre el pendiente de tests sin montar jsdom).
13. **`tenantStatus.js`** — hoist: `const BOGOTA_TZ = 'America/Bogota'` y `const DATE_FMT = new Intl.DateTimeFormat('en-CA', { timeZone: BOGOTA_TZ })` a scope de módulo; exportar además `bogotaDate(d = new Date()) → 'YYYY-MM-DD'` para reutilizar en API (parseRange) — nota: en el bundle frontend NO se importa este módulo (es de api/_lib); el frontend no lo necesita.
14. **productsGet** — comentario explicando el par `Cache-Control: private` + `Vary: Authorization` y por qué cualquier endpoint `/api` futuro con `max-age > 0` debe replicarlo.

## 5. Fuera de alcance (YAGNI)

- Librería de gráficos / charts interactivos.
- Reportes comparativos entre rangos ("vs. semana anterior").
- Export PDF de reportes.
- Programación de reportes por correo.
- Migraciones SQL versionadas (el schema aún no está en producción).

## 6. Testing / verificación

- **Vitest**: tests de `classifyBootstrapError` (3 ramas), test del default '7d' y del allowlist HS256 en jwt. Suite existente (15) debe seguir en verde.
- **SQL**: sin Postgres local — las 7 funciones se validan en el E2E del deploy (Task 11 pendiente absorbe este trabajo: es el mismo `schema.sql`).
- **Build**: `npm run build` limpio por tarea.
- **E2E (se suma al checklist de Task 11)**: reporte de rango multi-día cuadra con la suma de días individuales; register-detail muestra las facturas cobradas en esa caja; export XLSX abre en Excel con números como números; top-products filtrado por vendedor coincide con el modal del vendedor.

## 7. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Desfase de día entre SQL (`AT TIME ZONE`) y JS (`Intl`) | Ambos usan `America/Bogota`; el E2E incluye una venta cercana a medianoche |
| Shapes de respuesta cambian y rompen componentes existentes | Los campos actuales se conservan; solo se agregan `from`/`to`/`by_day`; review por tarea verifica consumidores |
| `jsonb_array_elements` sobre items malformados | `COALESCE` en claves y `WHERE jsonb_typeof(items) = 'array'` |
| Import estático de `xlsx` engorda el bundle | Import dinámico en `exportExcel.js` |
