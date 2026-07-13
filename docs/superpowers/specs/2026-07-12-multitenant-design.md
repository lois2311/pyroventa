# PyroVenta Multitenant — Diseño

**Fecha:** 2026-07-12
**Estado:** Aprobado por el usuario

## Objetivo

Convertir PyroVenta (PWA POS single-tenant sobre Supabase + Vercel) en una plataforma multitenant donde un **super admin** da de alta empresas clientes, les asigna vigencia de licencia por temporada, crea su primer usuario admin y ve métricas globales de uso.

## Decisiones tomadas

| Decisión | Elección |
|---|---|
| Arquitectura | Base compartida con columna `tenant_id` (una sola base Supabase, un solo deploy Vercel) |
| Acceso del cliente | Misma URL + slug de empresa; link único `pyroventa.app/c/<slug>` que amarra el dispositivo |
| Token | JWT firmado HS256 (librería `jose`), reemplaza el `base64(sellerId:locationId)` forjable |
| Datos existentes | No hay datos reales: el schema se rehace desde cero |
| Super admin | Login email + contraseña (bcrypt), panel en `/super` |

## 1. Modelo de datos

### Tablas nuevas

```sql
tenants (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  slug          TEXT NOT NULL UNIQUE,     -- minúsculas, kebab-case
  active        BOOLEAN NOT NULL DEFAULT true,
  license_start DATE NOT NULL,
  license_end   DATE NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
)

super_admins (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,            -- bcrypt
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
)
```

### Tablas existentes

- Columna `tenant_id UUID NOT NULL REFERENCES tenants(id)` en **todas** las tablas: `locations`, `sellers`, `seller_locations`, `categories`, `products`, `presentations`, `stock`, `registers`, `invoices`. Denormalizado a propósito: toda query filtra directo por `tenant_id` sin joins y las métricas globales son consultas simples.
- Índice `idx_<tabla>_tenant` por `tenant_id` en cada tabla.
- El índice único parcial de códigos de factura (`code, location_id WHERE status='pending'`) no cambia — `location_id` ya queda tenant-scoped.
- `get_next_invoice_code(p_location_id)` no cambia.
- Se entrega un `schema.sql` nuevo completo (drop + create); no hay migración de datos.

### RLS

- Se **eliminan** las políticas anon amplias (`anon_read_locations`, `anon_read_categories`, `anon_read_products`, `anon_read_presentations`).
- RLS queda habilitado en todas las tablas sin políticas para anon: la anon key solo se usa para el canal realtime.
- Toda operación de datos pasa por las serverless functions con service key.

## 2. Autenticación

### Token vendedor/cajero/admin de cliente

JWT HS256 firmado con `JWT_SECRET` (env var de Vercel), expiración **7 días**. Claims:

```json
{ "tenantId": "...", "sellerId": "...", "locationId": "...", "role": "seller|cashier|admin", "exp": ... }
```

- El flujo de login para el usuario final no cambia: elige su nombre y digita PIN de 4 dígitos, pero scoped a su empresa.
- `requireAuth` (api/_lib/auth.js): verifica firma y expiración; valida en una sola consulta que el seller esté activo **y** que su tenant esté `active = true` y hoy esté dentro de `[license_start, license_end]`.
- Licencia vencida o tenant suspendido → `403` con `{ error, code: 'LICENSE_EXPIRED' | 'TENANT_SUSPENDED' }`. El frontend muestra "Licencia vencida, contacte a su proveedor" y bloquea la operación.

### Token super admin

- `POST /api/auth/super/login` con email + contraseña; compara bcrypt contra `super_admins.password_hash`.
- JWT con `{ role: 'super_admin', superAdminId }`, expiración 24 h.
- Nuevo middleware `requireSuperAdmin`.
- El primer super admin se crea por seed SQL (hash generado con un script one-off).

## 3. Acceso del cliente

- **Ruta `/c/:slug`**: guarda el slug en localStorage y redirige al login mostrando el nombre de la empresa.
- **Sin slug guardado**: el login pide primero el "código de empresa" (slug).
- **`GET /api/public/tenant/:slug`** (sin auth): devuelve `{ tenant: {id, name, slug}, locations, sellers (id, name, role) }` solo si el tenant está activo y vigente. Reemplaza las lecturas directas con anon key que hoy hace la pantalla de login. No expone PINs.
- **Realtime**: sin cambios — canal `postgres_changes` filtrado por `location_id` (UUID inguessable) + polling de respaldo cada 30 s.

## 4. Panel Super Admin (`/super`)

- **`/super/login`**: email + contraseña.
- **`/super` (dashboard)**:
  - Lista de clientes: nombre, slug, estado (activo/suspendido/vencido), vigencia, ventas del día, última actividad.
  - Acciones: activar/suspender, editar vigencia.
  - **Wizard "Nuevo cliente"**: nombre empresa → vigencia (inicio/fin) → primer admin (nombre + PIN). Al finalizar muestra el link `pyroventa.app/c/<slug>` listo para copiar. El slug se genera del nombre (editable).
  - **Métricas globales**: total vendido y # facturas por cliente (hoy / rango de fechas).

## 5. API

### Rutas nuevas (catch-all `api/[[...path]].js`)

| Ruta | Método | Auth | Función |
|---|---|---|---|
| `/public/tenant/:slug` | GET | ninguna | Bootstrap de login por empresa |
| `/auth/super/login` | POST | ninguna | Login super admin |
| `/super/tenants` | GET | super | Lista clientes + estado |
| `/super/tenants` | POST | super | Crear cliente (+ primer admin opcional en el mismo payload) |
| `/super/tenants/:id` | PATCH | super | Activar/suspender, editar vigencia y nombre |
| `/super/tenants/:id/admin` | POST | super | Crear admin inicial del cliente |
| `/super/metrics` | GET | super | Ventas y facturas por tenant (hoy / rango) |

### Rutas existentes

- Todos los handlers filtran por `auth.tenantId` — centralizado en un helper (p. ej. `tenantScoped(supabaseAdmin, tabla, tenantId)`) para que ninguna ruta pueda olvidar el filtro.
- Las creaciones (`invoicesCreate`, `productsCreate`, `sellersCreate`, etc.) escriben `tenant_id` **desde el token, nunca desde el body**.
- `/auth/login` recibe además el `tenantSlug` (o `tenantId`) y valida que el seller pertenezca a ese tenant.

## 6. Frontend

- `authStore`: agrega `tenant: {id, name, slug}`; el slug persiste en clave separada (`pv_tenant_slug`) para sobrevivir el logout.
- Rutas nuevas en el router: `/c/:slug`, `/super/login`, `/super`.
- Componentes nuevos: `SuperLoginPage`, `SuperDashboard` (lista + wizard + métricas), pantalla/banner de licencia vencida.
- `LoginPage`: paso previo de código de empresa cuando no hay slug guardado; muestra el nombre de la empresa.
- Vendedor, caja, admin de cliente, offline queue e impresión: **sin cambios funcionales** (solo cambia el token que viaja).

## 7. Variables de entorno nuevas

- `JWT_SECRET` (Vercel, obligatoria).

## 8. Fuera de alcance (YAGNI)

- Auto-registro de clientes.
- Cobro/facturación de la plataforma.
- Branding por cliente (logo, colores).
- Subdominios por cliente.
- Migración de datos existentes (no hay datos reales).

## 9. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Una ruta olvida filtrar por tenant | Helper centralizado de queries tenant-scoped; revisión ruta por ruta en el plan |
| Token forjable (estado actual) | JWT firmado HS256 con secreto de servidor |
| Cliente sigue operando con licencia vencida | Validación en `requireAuth` en cada request, no solo en login |
| Realtime filtra solo por `location_id` | UUID inguessable + sin políticas anon de SELECT; aceptado a esta escala |
