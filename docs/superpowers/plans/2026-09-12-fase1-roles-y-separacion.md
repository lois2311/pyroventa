# Fase 1 — Roles y separación por punto de venta — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que cada administrador vea y maneje solo su punto de venta, que exista un Superadministrador (`owner`) con acceso a toda la empresa, y que el servidor —no la pantalla— haga cumplir esas reglas.

**Architecture:** Tres módulos puros y testeables en `api/_lib/` (`roles.js` matriz fija de acciones, `scope.js` alcance por punto, `userRules.js` reglas de quién administra a quién) más `passwords.js`. `requireAuth` calcula el alcance del usuario en cada petición leyendo la BD; todos los endpoints del router pasan por `requireCan(action)` y `scopedLocation()`. Un login nuevo por usuario + contraseña para admin/owner. El frontend consume el mismo `roles.js` para mostrar u ocultar.

**Tech Stack:** Node (Vercel functions, un solo router catch-all), Supabase JS con service key, `jose` (JWT), `bcryptjs`, React 18 + Zustand + React Router 6, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-12-roles-puntos-cajas-design.md` (§1 decisiones D1-D9, §3, §4, §6, §10 fase 1)

## Global Constraints

- Roles exactos en BD: `seller`, `cashier`, `admin`, `owner`. Etiquetas: Vendedor, Cajero, Administrador, Superadministrador.
- Un `admin` tiene **exactamente un** punto de venta. Un `owner` no tiene filas en `seller_locations` (su alcance son todos los puntos de la empresa).
- Solo `owner` crea/edita/desactiva `admin` y `owner`. Un `admin` solo administra `seller` y `cashier` de su punto.
- Nadie cambia su propio rol, puntos ni estado. Siempre queda al menos un `owner` activo.
- Catálogo (productos, presentaciones, carga masiva, fotos) y puntos de venta (crear/renombrar/desactivar): solo `owner`. El `admin` sí puede cambiar la configuración de impresora de su punto.
- Cajero también vende (D3). Admin y owner venden y cobran (D8).
- Contraseña admin/owner: mínimo **10** caracteres. Usuario: `^[a-z0-9._-]{3,32}$`, se guarda en minúsculas.
- Token de sesión administrativa: **8h**. Token de PIN: se conserva `7d`.
- Vendedor y cajero siguen entrando con PIN de 4 dígitos. El login por PIN **ya no acepta** `admin`/`owner`.
- Mensajes de error al usuario en español.
- **Desviación consciente del spec §3.3:** no se cambian las firmas de las funciones SQL `report_range_*` a `p_location_ids UUID[]`. La garantía equivalente es `resolveLocation()`, que nunca devuelve `null` a quien no es owner, más los tests de matriz del Task 9.
- El PIN no se vuelve a enviar al navegador (la API devuelve `has_pin`).

## File Structure

| Archivo | Acción | Responsabilidad |
|---|---|---|
| `supabase/migrations/2026-09-12_roles_owner.sql` | Crear | Rol `owner`, columnas `username`/`password_hash`, reglas CHECK, desactiva admins de PIN |
| `supabase/schema.sql` | Modificar | Reflejar la migración |
| `supabase/migrations/2026-08-03_transfer_provider.sql` | Revertir | Quitar la basura `sss` |
| `api/_lib/roles.js` | Crear | Matriz fija rol → acciones, `can`, `assignableRoles`, `ROLE_LABELS` |
| `api/_lib/scope.js` | Crear | `buildScope`, `resolveLocation`, `locationInScope` |
| `api/_lib/passwords.js` | Crear | Validar usuario/contraseña, hash y verificación bcrypt |
| `api/_lib/userRules.js` | Crear | `checkUserChange`: quién puede crear/editar a quién |
| `api/_lib/adminLogin.js` | Crear | `POST /auth/admin-login` |
| `api/_lib/auth.js` | Modificar | `requireAuth` con `scope`, nuevo `requireCan`; se elimina `requireAdmin` |
| `api/_lib/superRoutes.js` | Modificar | El primer usuario de una empresa es `owner` con usuario/contraseña |
| `api/[[...path]].js` | Modificar | Candados de rol y alcance en todos los endpoints |
| `api/_lib/__tests__/roles.test.js`, `scope.test.js`, `passwords.test.js`, `userRules.test.js` | Crear | Tests unitarios |
| `api/_lib/__tests__/fakeSupabase.js` | Crear | Doble de Supabase para tests del router |
| `api/_lib/__tests__/scopeMatrix.test.js` | Crear | Matriz rol × endpoint contra el router real |
| `src/store/authStore.js` | Modificar | `locations`, `setLocation` |
| `src/pages/LoginPage.jsx` | Modificar | Ingreso administrativo (usuario + contraseña + elegir punto) |
| `src/App.jsx` | Modificar | Guardas de ruta con `can` |
| `src/components/Topbar.jsx` | Modificar | Enlaces por rol, etiquetas, selector de punto para owner |
| `src/pages/AdminPage.jsx` | Modificar | Pestañas por rol, sin comparativo para admin, formulario de usuarios nuevo, punto de venta solo impresora para admin |
| `src/pages/SuperDashboard.jsx` | Modificar | Wizard crea Superadministrador con usuario/contraseña |
| `docs/manual-usuarios.md` | Crear | Manual para Laura y Julián |

---

### Task 1: Migración de roles y credenciales

**Files:**
- Create: `supabase/migrations/2026-09-12_roles_owner.sql`
- Modify: `supabase/schema.sql:51-61` (tabla `sellers`) y sección de índices
- Revert: `supabase/migrations/2026-08-03_transfer_provider.sql`

**Interfaces:**
- Produces: columnas `sellers.username TEXT` (minúsculas, única por empresa), `sellers.password_hash TEXT`, `sellers.pin` nullable, rol `owner`.

- [ ] **Step 1: Revertir la basura del archivo de transferencias**

Run: `git checkout -- supabase/migrations/2026-08-03_transfer_provider.sql`
Then: `git diff --stat` → no debe listar ese archivo.

- [ ] **Step 2: Crear la migración**

`supabase/migrations/2026-09-12_roles_owner.sql`:

```sql
-- =====================================================
-- PyroVenta — Fase 1: Superadministrador y admins por punto
--
-- - Nuevo rol 'owner' (Superadministrador de la empresa: todos los puntos).
-- - Admin y owner entran con usuario + contraseña (bcrypt), no con PIN.
-- - Los admins actuales de PIN quedan DESACTIVADOS: no tienen usuario ni
--   contraseña y el login por PIN deja de aceptar administradores. Tras
--   correr esto, crear el Superadministrador desde el panel /super y que él
--   cree los administradores de cada punto.
--
-- Ejecutar en el SQL Editor de Supabase ANTES de desplegar el código.
-- NO destructivo (no borra filas).
-- =====================================================

ALTER TABLE sellers DROP CONSTRAINT IF EXISTS sellers_role_check;
ALTER TABLE sellers ADD CONSTRAINT sellers_role_check
  CHECK (role IN ('seller', 'cashier', 'admin', 'owner'));

ALTER TABLE sellers ADD COLUMN IF NOT EXISTS username      TEXT;
ALTER TABLE sellers ADD COLUMN IF NOT EXISTS password_hash TEXT;
ALTER TABLE sellers ALTER COLUMN pin DROP NOT NULL;

-- Usuario siempre en minúsculas y único por empresa
ALTER TABLE sellers DROP CONSTRAINT IF EXISTS sellers_username_lower;
ALTER TABLE sellers ADD CONSTRAINT sellers_username_lower
  CHECK (username IS NULL OR username = lower(username));
CREATE UNIQUE INDEX IF NOT EXISTS sellers_tenant_username
  ON sellers(tenant_id, username) WHERE username IS NOT NULL;

-- Admins de PIN existentes: se desactivan (ver encabezado)
UPDATE sellers SET active = false
WHERE role = 'admin' AND (username IS NULL OR password_hash IS NULL);

-- Un usuario ACTIVO debe tener las credenciales de su rol.
-- Los inactivos quedan libres para poder desactivar sin completar datos.
ALTER TABLE sellers DROP CONSTRAINT IF EXISTS sellers_credentials_by_role;
ALTER TABLE sellers ADD CONSTRAINT sellers_credentials_by_role CHECK (
  NOT active
  OR (role IN ('admin', 'owner') AND username IS NOT NULL AND password_hash IS NOT NULL)
  OR (role IN ('seller', 'cashier') AND pin IS NOT NULL)
);
```

- [ ] **Step 3: Reflejar en `supabase/schema.sql`**

Reemplazar la tabla `sellers` (líneas 51-61) por:

```sql
-- ---- USUARIOS (vendedor, cajero, admin de punto, superadmin) ----
CREATE TABLE sellers (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  pin           CHAR(4),                 -- vendedor / cajero
  username      TEXT CHECK (username IS NULL OR username = lower(username)), -- admin / owner
  password_hash TEXT,                    -- bcrypt, admin / owner
  role          TEXT NOT NULL DEFAULT 'seller'
                CHECK (role IN ('seller', 'cashier', 'admin', 'owner')),
  active        BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT sellers_credentials_by_role CHECK (
    NOT active
    OR (role IN ('admin', 'owner') AND username IS NOT NULL AND password_hash IS NOT NULL)
    OR (role IN ('seller', 'cashier') AND pin IS NOT NULL)
  )
);
```

Y en la sección `-- ---- ÍNDICES` agregar:

```sql
CREATE UNIQUE INDEX sellers_tenant_username ON sellers(tenant_id, username) WHERE username IS NOT NULL;
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/2026-09-12_roles_owner.sql supabase/schema.sql
git commit -m "feat(db): rol owner y credenciales usuario/contraseña para administradores"
```

---

### Task 2: Matriz de roles y alcance por punto

**Files:**
- Create: `api/_lib/roles.js`, `api/_lib/scope.js`
- Test: `api/_lib/__tests__/roles.test.js`, `api/_lib/__tests__/scope.test.js`

**Interfaces:**
- Produces:
  - `ROLES: string[]`, `ROLE_LABELS: Record<role, string>`
  - `can(role: string, action: string): boolean`
  - `assignableRoles(actorRole: string): string[]`
  - `buildScope(role, sellerLocationIds: string[], tenantLocationIds: string[]): { all: boolean, locationIds: string[] }`
  - `resolveLocation(scope, requested: string|null, opts?: { allowAll?: boolean }): { ok: true, locationId: string|null } | { ok: false, status: number, error: string }`
  - `locationInScope(scope, locationId): boolean`
  - Acciones válidas: `sell`, `charge`, `refund`, `cash_session`, `view_reports`, `manage_staff`, `manage_registers`, `configure_printer`, `manage_admins`, `manage_catalog`, `manage_locations`, `view_consolidated`.

- [ ] **Step 1: Escribir los tests que fallan**

`api/_lib/__tests__/roles.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { can, assignableRoles, ROLES, ROLE_LABELS } from '../roles.js'

describe('can', () => {
  it('vendedor vende pero no cobra ni ve reportes', () => {
    expect(can('seller', 'sell')).toBe(true)
    expect(can('seller', 'charge')).toBe(false)
    expect(can('seller', 'view_reports')).toBe(false)
  })

  it('cajero vende y cobra, sin administración', () => {
    expect(can('cashier', 'sell')).toBe(true)
    expect(can('cashier', 'charge')).toBe(true)
    expect(can('cashier', 'refund')).toBe(true)
    expect(can('cashier', 'cash_session')).toBe(true)
    expect(can('cashier', 'manage_staff')).toBe(false)
  })

  it('admin administra su punto pero no catálogo, puntos, admins ni consolidado', () => {
    for (const a of ['sell', 'charge', 'view_reports', 'manage_staff', 'manage_registers', 'configure_printer']) {
      expect(can('admin', a)).toBe(true)
    }
    for (const a of ['manage_admins', 'manage_catalog', 'manage_locations', 'view_consolidated']) {
      expect(can('admin', a)).toBe(false)
    }
  })

  it('owner puede todo', () => {
    for (const a of ['sell', 'charge', 'manage_admins', 'manage_catalog', 'manage_locations', 'view_consolidated']) {
      expect(can('owner', a)).toBe(true)
    }
  })

  it('rol o acción desconocidos → false', () => {
    expect(can('hacker', 'sell')).toBe(false)
    expect(can('owner', 'borrar_todo')).toBe(false)
    expect(can(undefined, 'sell')).toBe(false)
  })
})

describe('assignableRoles', () => {
  it('owner asigna los cuatro roles', () => {
    expect(assignableRoles('owner')).toEqual(['seller', 'cashier', 'admin', 'owner'])
  })
  it('admin solo vendedor y cajero', () => {
    expect(assignableRoles('admin')).toEqual(['seller', 'cashier'])
  })
  it('cajero y vendedor nada', () => {
    expect(assignableRoles('cashier')).toEqual([])
    expect(assignableRoles('seller')).toEqual([])
  })
})

describe('ROLE_LABELS', () => {
  it('tiene etiqueta para cada rol', () => {
    expect(ROLES.every(r => typeof ROLE_LABELS[r] === 'string')).toBe(true)
    expect(ROLE_LABELS.owner).toBe('Superadministrador')
  })
})
```

`api/_lib/__tests__/scope.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { buildScope, resolveLocation, locationInScope } from '../scope.js'

const NORTE = 'loc-norte', SUR = 'loc-sur'

describe('buildScope', () => {
  it('owner: todos los puntos de la empresa, ignora seller_locations', () => {
    expect(buildScope('owner', [], [NORTE, SUR])).toEqual({ all: true, locationIds: [NORTE, SUR] })
  })
  it('no-owner: solo sus puntos asignados', () => {
    expect(buildScope('admin', [NORTE], [NORTE, SUR])).toEqual({ all: false, locationIds: [NORTE] })
  })
})

describe('resolveLocation', () => {
  const owner = buildScope('owner', [], [NORTE, SUR])
  const adminNorte = buildScope('admin', [NORTE], [])
  const multi = buildScope('seller', [NORTE, SUR], [])
  const none = buildScope('seller', [], [])

  it('owner sin punto y allowAll → consolidado (null)', () => {
    expect(resolveLocation(owner, null, { allowAll: true })).toEqual({ ok: true, locationId: null })
  })
  it('owner sin punto y sin allowAll → 400', () => {
    expect(resolveLocation(owner, null)).toMatchObject({ ok: false, status: 400 })
  })
  it('owner con punto de su empresa → ese punto', () => {
    expect(resolveLocation(owner, SUR)).toEqual({ ok: true, locationId: SUR })
  })
  it('owner con punto de otra empresa → 403', () => {
    expect(resolveLocation(owner, 'loc-ajena')).toMatchObject({ ok: false, status: 403 })
  })
  it('admin Norte pidiendo Sur → 403', () => {
    expect(resolveLocation(adminNorte, SUR, { allowAll: true })).toMatchObject({ ok: false, status: 403 })
  })
  it('admin Norte sin punto → Norte, NUNCA null aunque allowAll', () => {
    expect(resolveLocation(adminNorte, null, { allowAll: true })).toEqual({ ok: true, locationId: NORTE })
    expect(resolveLocation(adminNorte, undefined)).toEqual({ ok: true, locationId: NORTE })
  })
  it('usuario con varios puntos sin elegir → 400', () => {
    expect(resolveLocation(multi, null, { allowAll: true })).toMatchObject({ ok: false, status: 400 })
  })
  it('usuario sin puntos → 403', () => {
    expect(resolveLocation(none, null)).toMatchObject({ ok: false, status: 403 })
  })
  it('scope ausente → 403', () => {
    expect(resolveLocation(undefined, NORTE)).toMatchObject({ ok: false, status: 403 })
  })
})

describe('locationInScope', () => {
  it('verifica pertenencia', () => {
    const s = buildScope('admin', [NORTE], [])
    expect(locationInScope(s, NORTE)).toBe(true)
    expect(locationInScope(s, SUR)).toBe(false)
    expect(locationInScope(s, null)).toBe(false)
  })
})
```

- [ ] **Step 2: Correr y verificar que fallan**

Run: `npx vitest run api/_lib/__tests__/roles.test.js api/_lib/__tests__/scope.test.js`
Expected: FAIL — `Failed to resolve import "../roles.js"`.

- [ ] **Step 3: Implementar**

`api/_lib/roles.js`:

```js
// =====================================================
// PyroVenta — Roles fijos y qué puede hacer cada uno.
// Lo importan tanto la API como el frontend: no usar APIs de Node aquí.
// =====================================================

export const ROLES = ['seller', 'cashier', 'admin', 'owner']

export const ROLE_LABELS = {
  seller:  'Vendedor',
  cashier: 'Cajero',
  admin:   'Administrador',
  owner:   'Superadministrador',
}

const STAFF   = ['seller', 'cashier', 'admin', 'owner']
const CASHIER = ['cashier', 'admin', 'owner']
const ADMIN   = ['admin', 'owner']
const OWNER   = ['owner']

const ACTIONS = {
  sell:              STAFF,    // crear ventas (el cajero también vende)
  charge:            CASHIER,  // cobrar, cancelar y editar facturas pendientes
  refund:            CASHIER,
  cash_session:      CASHIER,  // cierre de caja
  view_reports:      ADMIN,    // reportes e historial del punto
  manage_staff:      ADMIN,    // usuarios (el admin: vendedores y cajeros de su punto)
  manage_registers:  ADMIN,
  configure_printer: ADMIN,
  manage_admins:     OWNER,
  manage_catalog:    OWNER,
  manage_locations:  OWNER,
  view_consolidated: OWNER,
}

export function can(role, action) {
  return !!ACTIONS[action]?.includes(role)
}

/** Roles que `actorRole` puede asignar al crear o editar usuarios. */
export function assignableRoles(actorRole) {
  if (actorRole === 'owner') return [...ROLES]
  if (actorRole === 'admin') return ['seller', 'cashier']
  return []
}
```

`api/_lib/scope.js`:

```js
// =====================================================
// PyroVenta — Alcance por punto de venta.
// El alcance sale de la BD en cada petición (requireAuth), nunca del body.
// =====================================================

/**
 * @param {string} role
 * @param {string[]} sellerLocationIds  puntos asignados en seller_locations
 * @param {string[]} tenantLocationIds  todos los puntos de la empresa (solo se usa para owner)
 */
export function buildScope(role, sellerLocationIds, tenantLocationIds) {
  return role === 'owner'
    ? { all: true, locationIds: [...tenantLocationIds] }
    : { all: false, locationIds: [...sellerLocationIds] }
}

const deny = (status, error) => ({ ok: false, status, error })

/**
 * Punto de venta efectivo de una petición.
 * Solo el owner con allowAll puede recibir null (= consolidado de la empresa).
 */
export function resolveLocation(scope, requested, { allowAll = false } = {}) {
  const ids = scope?.locationIds || []
  if (requested) {
    return ids.includes(requested)
      ? { ok: true, locationId: requested }
      : deny(403, 'No tienes acceso a ese punto de venta')
  }
  if (scope?.all) {
    return allowAll ? { ok: true, locationId: null } : deny(400, 'location_id requerido')
  }
  if (ids.length === 1) return { ok: true, locationId: ids[0] }
  if (ids.length === 0) return deny(403, 'No tienes puntos de venta asignados')
  return deny(400, 'location_id requerido')
}

export function locationInScope(scope, locationId) {
  return !!locationId && !!scope?.locationIds?.includes(locationId)
}
```

- [ ] **Step 4: Correr y verificar que pasan**

Run: `npx vitest run api/_lib/__tests__/roles.test.js api/_lib/__tests__/scope.test.js`
Expected: PASS (todos).

- [ ] **Step 5: Commit**

```bash
git add api/_lib/roles.js api/_lib/scope.js api/_lib/__tests__/roles.test.js api/_lib/__tests__/scope.test.js
git commit -m "feat(api): matriz fija de roles y alcance por punto de venta"
```

---

### Task 3: Contraseñas y reglas de administración de usuarios

**Files:**
- Create: `api/_lib/passwords.js`, `api/_lib/userRules.js`
- Modify: `api/_lib/superRoutes.js:15-17` (usar `DUMMY_HASH` de `passwords.js`)
- Test: `api/_lib/__tests__/passwords.test.js`, `api/_lib/__tests__/userRules.test.js`

**Interfaces:**
- Consumes: `assignableRoles` (Task 2).
- Produces:
  - `DUMMY_HASH: string`, `MIN_PASSWORD = 10`
  - `normalizeUsername(u): string`
  - `validateUsername(u): { ok: true, username } | { ok: false, error }`
  - `validatePassword(p): { ok: true } | { ok: false, error }`
  - `hashPassword(p): string`, `verifyPassword(p, hash|null): boolean`
  - `checkUserChange({ actor, target, patch, activeOwnerCount }): { ok: true, role, locationIds: string[]|undefined } | { ok: false, status, error }`
    - `actor = { id, role, locationIds }`
    - `target = null | { id, role, active, username, hasPassword, hasPin, locationIds }`
    - `patch = { name?, role?, active?, location_ids?, username?, password?, pin? }`

- [ ] **Step 1: Escribir los tests que fallan**

`api/_lib/__tests__/passwords.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { normalizeUsername, validateUsername, validatePassword, hashPassword, verifyPassword, MIN_PASSWORD } from '../passwords.js'

describe('usuario', () => {
  it('normaliza a minúsculas sin espacios', () => {
    expect(normalizeUsername('  Laura.Admin ')).toBe('laura.admin')
  })
  it('acepta letras, números, punto, guion y guion bajo (3-32)', () => {
    expect(validateUsername('admin-norte_1')).toEqual({ ok: true, username: 'admin-norte_1' })
  })
  it('rechaza cortos, largos, espacios y símbolos', () => {
    for (const u of ['ab', 'a'.repeat(33), 'laura admin', 'laura@x', '', undefined]) {
      expect(validateUsername(u).ok).toBe(false)
    }
  })
})

describe('contraseña', () => {
  it(`exige al menos ${MIN_PASSWORD} caracteres`, () => {
    expect(validatePassword('123456789').ok).toBe(false)
    expect(validatePassword('1234567890').ok).toBe(true)
    expect(validatePassword(undefined).ok).toBe(false)
  })
  it('hash verificable y distinto del texto', () => {
    const h = hashPassword('clave-segura-1')
    expect(h).not.toContain('clave-segura-1')
    expect(verifyPassword('clave-segura-1', h)).toBe(true)
    expect(verifyPassword('otra-clave-99', h)).toBe(false)
  })
  it('sin hash guardado siempre falla', () => {
    expect(verifyPassword('pyroventa-dummy', null)).toBe(false)
  })
})
```

`api/_lib/__tests__/userRules.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { checkUserChange } from '../userRules.js'

const NORTE = 'loc-norte', SUR = 'loc-sur'
const owner      = { id: 'u-owner', role: 'owner', locationIds: [NORTE, SUR] }
const adminNorte = { id: 'u-an', role: 'admin', locationIds: [NORTE] }
const cashier    = { id: 'u-c', role: 'cashier', locationIds: [NORTE] }

const user = (over = {}) => ({
  id: 'u-x', role: 'seller', active: true, username: null, hasPassword: false, hasPin: true, locationIds: [NORTE], ...over,
})

describe('crear', () => {
  it('admin crea vendedor en su punto (puntos por defecto = los suyos)', () => {
    const r = checkUserChange({ actor: adminNorte, target: null, patch: { name: 'Ana', pin: '1234' } })
    expect(r).toEqual({ ok: true, role: 'seller', locationIds: [NORTE] })
  })
  it('admin NO crea vendedor en Sur', () => {
    const r = checkUserChange({ actor: adminNorte, target: null, patch: { name: 'Ana', pin: '1234', location_ids: [SUR] } })
    expect(r).toMatchObject({ ok: false, status: 403 })
  })
  it('admin NO crea admin ni owner', () => {
    for (const role of ['admin', 'owner']) {
      const r = checkUserChange({ actor: adminNorte, target: null, patch: { name: 'X', role, username: 'xadmin', password: '1234567890' } })
      expect(r).toMatchObject({ ok: false, status: 403 })
    }
  })
  it('cajero no crea a nadie', () => {
    const r = checkUserChange({ actor: cashier, target: null, patch: { name: 'X', pin: '1234' } })
    expect(r).toMatchObject({ ok: false, status: 403 })
  })
  it('owner crea admin con exactamente un punto', () => {
    const ok = checkUserChange({ actor: owner, target: null, patch: { role: 'admin', username: 'admin.sur', password: '1234567890', location_ids: [SUR] } })
    expect(ok).toEqual({ ok: true, role: 'admin', locationIds: [SUR] })
    const dos = checkUserChange({ actor: owner, target: null, patch: { role: 'admin', username: 'admin.sur', password: '1234567890', location_ids: [NORTE, SUR] } })
    expect(dos).toMatchObject({ ok: false, status: 400 })
    const cero = checkUserChange({ actor: owner, target: null, patch: { role: 'admin', username: 'admin.sur', password: '1234567890' } })
    expect(cero).toMatchObject({ ok: false, status: 400 })
  })
  it('owner crea owner sin puntos aunque mande location_ids', () => {
    const r = checkUserChange({ actor: owner, target: null, patch: { role: 'owner', username: 'julian', password: '1234567890', location_ids: [NORTE] } })
    expect(r).toEqual({ ok: true, role: 'owner', locationIds: [] })
  })
  it('valida credenciales según rol', () => {
    expect(checkUserChange({ actor: adminNorte, target: null, patch: { name: 'A', pin: '12' } })).toMatchObject({ ok: false, status: 400 })
    expect(checkUserChange({ actor: owner, target: null, patch: { role: 'admin', username: 'ab', password: '1234567890', location_ids: [NORTE] } })).toMatchObject({ ok: false, status: 400 })
    expect(checkUserChange({ actor: owner, target: null, patch: { role: 'admin', username: 'admin.n', password: 'corta', location_ids: [NORTE] } })).toMatchObject({ ok: false, status: 400 })
  })
  it('vendedor sin puntos → 400 (owner no tiene puntos por defecto)', () => {
    const r = checkUserChange({ actor: owner, target: null, patch: { name: 'A', pin: '1234' } })
    expect(r).toMatchObject({ ok: false, status: 400 })
  })
})

describe('editar', () => {
  it('admin edita el nombre de un cajero de su punto sin tocar credenciales', () => {
    const r = checkUserChange({ actor: adminNorte, target: user({ role: 'cashier' }), patch: { name: 'Nuevo' } })
    expect(r).toEqual({ ok: true, role: 'cashier', locationIds: undefined })
  })
  it('admin no edita usuario que también trabaja en Sur', () => {
    const r = checkUserChange({ actor: adminNorte, target: user({ locationIds: [NORTE, SUR] }), patch: { name: 'X' } })
    expect(r).toMatchObject({ ok: false, status: 403 })
  })
  it('admin no edita otro admin ni un owner', () => {
    const otroAdmin = user({ id: 'u-as', role: 'admin', username: 'admin.s', hasPassword: true, hasPin: false })
    expect(checkUserChange({ actor: adminNorte, target: otroAdmin, patch: { name: 'X' } })).toMatchObject({ ok: false, status: 403 })
    const unOwner = user({ id: 'u-o', role: 'owner', username: 'laura', hasPassword: true, hasPin: false, locationIds: [] })
    expect(checkUserChange({ actor: adminNorte, target: unOwner, patch: { active: false } })).toMatchObject({ ok: false, status: 403 })
  })
  it('admin no se asciende a owner a sí mismo', () => {
    const yo = user({ id: adminNorte.id, role: 'admin', username: 'admin.n', hasPassword: true, hasPin: false })
    expect(checkUserChange({ actor: adminNorte, target: yo, patch: { role: 'owner' } })).toMatchObject({ ok: false, status: 403 })
  })
  it('nadie cambia su propio rol, puntos o estado; sí su nombre y contraseña', () => {
    const yo = user({ id: owner.id, role: 'owner', username: 'laura', hasPassword: true, hasPin: false, locationIds: [] })
    expect(checkUserChange({ actor: owner, target: yo, patch: { role: 'admin' }, activeOwnerCount: 2 })).toMatchObject({ ok: false, status: 403 })
    expect(checkUserChange({ actor: owner, target: yo, patch: { active: false }, activeOwnerCount: 2 })).toMatchObject({ ok: false, status: 403 })
    expect(checkUserChange({ actor: owner, target: yo, patch: { name: 'Laura M', password: 'otra-clave-10' } })).toMatchObject({ ok: true })
  })
  it('no se desactiva ni degrada al último owner activo', () => {
    const otro = user({ id: 'u-o2', role: 'owner', username: 'julian', hasPassword: true, hasPin: false, locationIds: [] })
    expect(checkUserChange({ actor: owner, target: otro, patch: { active: false }, activeOwnerCount: 1 })).toMatchObject({ ok: false, status: 409 })
    expect(checkUserChange({ actor: owner, target: otro, patch: { active: false }, activeOwnerCount: 2 })).toMatchObject({ ok: true })
  })
  it('ascender vendedor a admin exige usuario, contraseña y un solo punto', () => {
    const v = user()
    expect(checkUserChange({ actor: owner, target: v, patch: { role: 'admin' } })).toMatchObject({ ok: false, status: 400 })
    expect(checkUserChange({ actor: owner, target: v, patch: { role: 'admin', username: 'admin.n', password: '1234567890' } }))
      .toEqual({ ok: true, role: 'admin', locationIds: undefined })
  })
  it('degradar owner a cajero exige PIN y puntos', () => {
    const o = user({ id: 'u-o2', role: 'owner', username: 'julian', hasPassword: true, hasPin: false, locationIds: [] })
    expect(checkUserChange({ actor: owner, target: o, patch: { role: 'cashier', pin: '4321' }, activeOwnerCount: 2 })).toMatchObject({ ok: false, status: 400 })
    expect(checkUserChange({ actor: owner, target: o, patch: { role: 'cashier', pin: '4321', location_ids: [SUR] }, activeOwnerCount: 2 }))
      .toEqual({ ok: true, role: 'cashier', locationIds: [SUR] })
  })
})
```

- [ ] **Step 2: Correr y verificar que fallan**

Run: `npx vitest run api/_lib/__tests__/passwords.test.js api/_lib/__tests__/userRules.test.js`
Expected: FAIL — no se resuelven `../passwords.js` y `../userRules.js`.

- [ ] **Step 3: Implementar `passwords.js`**

```js
import bcrypt from 'bcryptjs'

// Hash bcrypt (costo 10) precomputado de 'pyroventa-dummy' — iguala el tiempo de
// respuesta cuando el usuario no existe sin pagar el hash en cada cold start.
export const DUMMY_HASH = '$2b$10$cDwgjYniiWBg7KfhzC3lm.JZnXd7ujBEZeF4ow/0qkIhx.cn3bhPC'

export const MIN_PASSWORD = 10
const USERNAME_RE = /^[a-z0-9._-]{3,32}$/

export function normalizeUsername(u) {
  return String(u ?? '').trim().toLowerCase()
}

export function validateUsername(u) {
  const username = normalizeUsername(u)
  return USERNAME_RE.test(username)
    ? { ok: true, username }
    : { ok: false, error: 'Usuario inválido: de 3 a 32 caracteres, solo letras, números, punto, guion o guion bajo' }
}

export function validatePassword(p) {
  return typeof p === 'string' && p.length >= MIN_PASSWORD
    ? { ok: true }
    : { ok: false, error: `La contraseña debe tener al menos ${MIN_PASSWORD} caracteres` }
}

export function hashPassword(p) {
  return bcrypt.hashSync(p, 10)
}

/** Siempre ejecuta bcrypt (aunque no haya hash) para no revelar si el usuario existe. */
export function verifyPassword(p, hash) {
  const valid = bcrypt.compareSync(String(p ?? ''), hash || DUMMY_HASH)
  return valid && !!hash
}
```

En `api/_lib/superRoutes.js` borrar las líneas 15-17 (comentario + `const DUMMY_HASH = ...`) y agregar al bloque de imports:

```js
import { DUMMY_HASH } from './passwords.js'
```

- [ ] **Step 4: Implementar `userRules.js`**

```js
import { assignableRoles } from './roles.js'
import { validateUsername, validatePassword } from './passwords.js'

// =====================================================
// PyroVenta — Quién puede crear o modificar a quién.
// Puro: el router carga target/conteos y persiste lo que esto aprueba.
// =====================================================

const PIN_RE = /^\d{4}$/
const deny = (status, error) => ({ ok: false, status, error })

export function checkUserChange({ actor, target, patch, activeOwnerCount = 0 }) {
  const creating = !target
  const allowed = assignableRoles(actor.role)
  if (!allowed.length) return deny(403, 'No tienes permiso para administrar usuarios')

  const role = patch.role ?? target?.role ?? 'seller'

  if (!creating && actor.id === target.id) {
    const changesRole = patch.role !== undefined && patch.role !== target.role
    if (changesRole || patch.location_ids !== undefined || patch.active === false) {
      return deny(403, 'No puedes cambiar tu propio rol, puntos de venta o estado')
    }
  }

  if (!creating && !allowed.includes(target.role)) return deny(403, 'No puedes modificar a este usuario')
  if (!allowed.includes(role)) return deny(403, 'No puedes asignar ese rol')

  // Puntos a guardar: undefined = no cambian
  let locationIds
  if (role === 'owner') {
    locationIds = creating || target.role !== 'owner' ? [] : undefined
  } else if (patch.location_ids !== undefined) {
    locationIds = [...new Set(patch.location_ids)]
  } else if (creating) {
    locationIds = actor.role === 'admin' ? [...actor.locationIds] : []
  }
  const effective = locationIds ?? target?.locationIds ?? []

  if (actor.role === 'admin') {
    const outside = (ids) => ids.some(id => !actor.locationIds.includes(id))
    if (!creating && outside(target.locationIds)) {
      return deny(403, 'Este usuario trabaja en otro punto: solo el superadministrador puede modificarlo')
    }
    if (outside(effective)) return deny(403, 'No puedes asignar puntos de venta ajenos')
  }

  if (role !== 'owner' && effective.length === 0) return deny(400, 'Asigna al menos un punto de venta')
  if (role === 'admin' && effective.length !== 1) {
    return deny(400, 'Un administrador debe tener exactamente un punto de venta')
  }

  if (!creating && target.role === 'owner' && target.active
      && (role !== 'owner' || patch.active === false) && activeOwnerCount <= 1) {
    return deny(409, 'Debe quedar al menos un superadministrador activo')
  }

  if (role === 'admin' || role === 'owner') {
    if (creating || patch.username !== undefined || !target.username) {
      const u = validateUsername(patch.username ?? target?.username)
      if (!u.ok) return deny(400, u.error)
    }
    if (creating || patch.password !== undefined || !target.hasPassword) {
      const p = validatePassword(patch.password)
      if (!p.ok) return deny(400, p.error)
    }
  } else if (creating || patch.pin !== undefined || !target.hasPin) {
    if (!PIN_RE.test(patch.pin ?? '')) return deny(400, 'PIN debe ser 4 dígitos')
  }

  return { ok: true, role, locationIds }
}
```

- [ ] **Step 5: Correr todos los tests**

Run: `npm test`
Expected: PASS (los 28 anteriores + los nuevos).

- [ ] **Step 6: Commit**

```bash
git add api/_lib/passwords.js api/_lib/userRules.js api/_lib/superRoutes.js api/_lib/__tests__/passwords.test.js api/_lib/__tests__/userRules.test.js
git commit -m "feat(api): reglas de administración de usuarios y manejo de contraseñas"
```

---

### Task 4: `requireAuth` con alcance, `requireCan` y login administrativo

**Files:**
- Modify: `api/_lib/auth.js`
- Create: `api/_lib/adminLogin.js`
- Modify: `api/[[...path]].js:3` (imports), `:45` (ruta), `:153-169` (login PIN)

**Interfaces:**
- Consumes: `buildScope`, `can`, `verifyPassword`, `normalizeUsername`.
- Produces:
  - `requireAuth(req, res) → { seller: {id,name,role,active}, tenant, tenantId, locationId, scope } | null`
  - `requireCan(req, res, action) → auth | null` (403 `'No tienes permiso para esta acción'`)
  - `requireAdmin` **se elimina** (Task 5 reemplaza sus 17 usos).
  - `POST /api/auth/admin-login` body `{ tenant_slug, username, password }` → `200 { seller:{id,name,role}, tenant:{id,name,slug}, locations:[{id,name,address,printer_config}], token }`; 400/401/403/429.

- [ ] **Step 1: Reescribir `requireAuth` y agregar `requireCan`**

En `api/_lib/auth.js` agregar imports:

```js
import { buildScope } from './scope.js'
import { can } from './roles.js'
```

Reemplazar `requireAuth` completo y `requireAdmin` por:

```js
/**
 * Requiere JWT válido de un usuario de tenant.
 * Rol y puntos de venta se leen de la BD en cada petición: un cambio de rol
 * o de asignación aplica de inmediato aunque el token siga vigente.
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
      .select('id, name, role, active, seller_locations(location_id)')
      .eq('id', sellerId).eq('tenant_id', tenantId).eq('active', true)
      .single(),
    supabaseAdmin.from('tenants')
      .select('id, name, slug, active, license_start, license_end')
      .eq('id', tenantId)
      .single(),
  ])

  if (sellerRes.error || !sellerRes.data) {
    res.status(401).json({ error: 'Usuario inactivo o no existe' })
    return null
  }

  const status = getTenantStatus(tenantRes.data)
  if (!status.ok) {
    res.status(403).json({ error: status.message, code: status.code })
    return null
  }

  const { seller_locations, ...seller } = sellerRes.data
  let tenantLocationIds = []
  if (seller.role === 'owner') {
    const { data: locs } = await supabaseAdmin.from('locations').select('id').eq('tenant_id', tenantId)
    tenantLocationIds = (locs || []).map(l => l.id)
  }
  const scope = buildScope(seller.role, (seller_locations || []).map(sl => sl.location_id), tenantLocationIds)

  return { seller, tenant: tenantRes.data, tenantId, locationId, scope }
}

/** Requiere que el rol del usuario permita `action` (ver roles.js). */
export async function requireCan(req, res, action) {
  const auth = await requireAuth(req, res)
  if (!auth) return null
  if (!can(auth.seller.role, action)) {
    res.status(403).json({ error: 'No tienes permiso para esta acción' })
    return null
  }
  return auth
}
```

- [ ] **Step 2: Crear `api/_lib/adminLogin.js`**

```js
import { supabaseAdmin } from './supabaseAdmin.js'
import { signToken } from './jwt.js'
import { getTenantStatus } from './tenantStatus.js'
import { normalizeUsername, verifyPassword } from './passwords.js'
import { clientIp, rejectIfLocked, recordFailedAttempt, clearAttempts } from './loginLock.js'

// =====================================================
// PyroVenta — Ingreso administrativo (admin de punto y superadministrador)
// =====================================================

export const ADMIN_SESSION = '8h'

export async function adminLogin(req, res) {
  const { tenant_slug, username, password } = req.body || {}
  if (!tenant_slug || !username || !password) {
    return res.status(400).json({ error: 'Empresa, usuario y contraseña son requeridos' })
  }

  const { data: tenant, error: tenantErr } = await supabaseAdmin
    .from('tenants').select('id, name, slug, active, license_start, license_end')
    .eq('slug', String(tenant_slug).toLowerCase().trim()).single()
  if (tenantErr && tenantErr.code !== 'PGRST116') return res.status(500).json({ error: 'Error interno del servidor' })
  const status = getTenantStatus(tenant)
  if (!status.ok) {
    return res.status(status.code === 'TENANT_NOT_FOUND' ? 404 : 403).json({ error: status.message, code: status.code })
  }

  const uname = normalizeUsername(username)
  const lockKey = `admin:${tenant.id}:${uname}:${clientIp(req)}`
  if (await rejectIfLocked(supabaseAdmin, lockKey, res)) return

  const { data: user } = await supabaseAdmin.from('sellers')
    .select('id, name, role, password_hash, seller_locations(location_id)')
    .eq('tenant_id', tenant.id).eq('username', uname).eq('active', true)
    .in('role', ['admin', 'owner'])
    .maybeSingle()

  const valid = verifyPassword(password, user?.password_hash)
  if (!user || !valid) {
    await recordFailedAttempt(supabaseAdmin, lockKey)
    return res.status(401).json({ error: 'Usuario o contraseña incorrectos' })
  }
  await clearAttempts(supabaseAdmin, lockKey)

  let q = supabaseAdmin.from('locations')
    .select('id, name, address, printer_config')
    .eq('tenant_id', tenant.id).eq('active', true).order('name')
  if (user.role !== 'owner') q = q.in('id', (user.seller_locations || []).map(sl => sl.location_id))
  const { data: locations, error: locErr } = await q
  if (locErr) return res.status(500).json({ error: 'Error interno del servidor' })
  if (!locations?.length) {
    return res.status(403).json({ error: 'No tienes puntos de venta activos asignados' })
  }

  const token = await signToken({ tenantId: tenant.id, sellerId: user.id, role: user.role, kind: 'admin' }, ADMIN_SESSION)
  return res.status(200).json({
    seller: { id: user.id, name: user.name, role: user.role },
    tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug },
    locations,
    token,
  })
}
```

- [ ] **Step 3: Conectar en el router y cerrar el login por PIN a administradores**

En `api/[[...path]].js` línea 3 reemplazar el import de auth y agregar los nuevos:

```js
import { requireAuth, requireCan } from './_lib/auth.js'
import { adminLogin } from './_lib/adminLogin.js'
```

Debajo de la línea 45 (`/auth/login`):

```js
  if (route === '/auth/admin-login' && method === 'POST') return adminLogin(req, res)
```

Reemplazar las líneas 153-169 de `authLogin` (consulta de sellers + fallback de admin) por:

```js
  // Solo vendedores y cajeros entran con PIN; admin y owner usan /auth/admin-login
  const { data: sellers, error } = await supabaseAdmin
    .from('sellers')
    .select('id, name, role, active, seller_locations!inner(location_id)')
    .eq('tenant_id', tenant.id)
    .eq('pin', pin).eq('active', true).in('role', ['seller', 'cashier'])
    .eq('seller_locations.location_id', location_id)

  if (error) return res.status(500).json({ error: 'Error interno del servidor' })
  const seller = sellers?.[0]
```

(La línea `let seller = sellers?.[0]` y el bloque `if (!seller) { const { data: admins } ... }` desaparecen.)

- [ ] **Step 4: Verificar que compila la carga del módulo**

El router todavía importa `requireAdmin` en usos internos; Task 5 los reemplaza. Para no dejar el árbol roto, **Task 4 y Task 5 se commitean juntos** al final de Task 5. Solo correr:

Run: `npm test`
Expected: PASS de los tests unitarios (ninguno importa el router todavía).

---

### Task 5: Candados de rol y alcance en todos los endpoints

**Files:**
- Modify: `api/[[...path]].js` (secciones LOCATIONS, PRODUCTS, SELLERS, REGISTERS, CIERRES, INVOICES, REPORTS)

**Interfaces:**
- Consumes: `requireAuth`, `requireCan` (Task 4); `resolveLocation`, `locationInScope` (Task 2); `checkUserChange` (Task 3); `hashPassword`, `normalizeUsername` (Task 3); `can` (Task 2).
- Produces: comportamiento HTTP verificado en Task 9. `GET /sellers` y respuestas de usuario devuelven `{ id, name, role, active, created_at, username, has_pin, has_password, seller_locations }` — **nunca** `pin` ni `password_hash`.

- [ ] **Step 1: Imports y helpers del router**

Agregar al bloque de imports:

```js
import { can } from './_lib/roles.js'
import { resolveLocation, locationInScope } from './_lib/scope.js'
import { checkUserChange } from './_lib/userRules.js'
import { hashPassword, normalizeUsername } from './_lib/passwords.js'
```

Agregar justo antes de `// ===== AUTH` (antes de `authLogin`):

```js
// =====================================================
// ALCANCE POR PUNTO DE VENTA
// =====================================================

/**
 * Punto efectivo de la petición. Si no aplica, responde el error y devuelve
 * undefined (el caller debe salir). null solo para owner con allowAll.
 */
function scopedLocation(auth, requested, res, opts) {
  const r = resolveLocation(auth.scope, requested || null, opts)
  if (!r.ok) { res.status(r.status).json({ error: r.error }); return undefined }
  return r.locationId
}

/** true (y responde 403) si el punto no está en el alcance del usuario. */
function denyOutOfScope(auth, locationId, res) {
  if (locationInScope(auth.scope, locationId)) return false
  res.status(403).json({ error: 'No tienes acceso a ese punto de venta' })
  return true
}

/** Caja del tenant dentro del alcance; responde 404/403 y devuelve null si no. */
async function loadScopedRegister(auth, id, res) {
  const { data } = await supabaseAdmin.from('registers')
    .select('id, name, location_id').eq('id', id).eq('tenant_id', auth.tenantId).single()
  if (!data) { res.status(404).json({ error: 'Caja no encontrada' }); return null }
  if (denyOutOfScope(auth, data.location_id, res)) return null
  return data
}
```

- [ ] **Step 2: LOCATIONS**

```js
async function locationsGet(req, res) {
  const auth = await requireAuth(req, res); if (!auth) return
  const { data, error } = await supabaseAdmin.from('locations')
    .select('id, name, address, printer_config, active')
    .eq('tenant_id', auth.tenantId).in('id', auth.scope.locationIds).order('name')
  if (error) return res.status(500).json({ error: error.message })
  return res.status(200).json(data)
}
```

En `locationsCreate` y `locationsDelete` cambiar la primera línea a:

```js
  const auth = await requireCan(req, res, 'manage_locations'); if (!auth) return
```

`locationsDelete` además, después de esa línea:

```js
  if (denyOutOfScope(auth, id, res)) return
```

Reemplazar `locationsUpdate`:

```js
async function locationsUpdate(req, res, id) {
  const auth = await requireCan(req, res, 'configure_printer'); if (!auth) return
  if (denyOutOfScope(auth, id, res)) return
  const { name, address, printer_config, active } = req.body || {}
  // El admin del punto solo ajusta la impresora; nombre, dirección y estado son del superadmin
  if ((name !== undefined || address !== undefined || active !== undefined) && !can(auth.seller.role, 'manage_locations')) {
    return res.status(403).json({ error: 'Solo el superadministrador puede editar los datos del punto de venta' })
  }
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
```

- [ ] **Step 3: PRODUCTS (catálogo solo owner)**

En `productsCreate`, `productsUpdate`, `productsDelete`, `productsBulkDelete`, `productsBulk` y `productsUploadImage` cambiar la primera línea a:

```js
  const auth = await requireCan(req, res, 'manage_catalog'); if (!auth) return
```

En `productsGet` (línea ~284) cambiar la condición:

```js
  if (includeInactive && !can(auth.seller.role, 'manage_catalog')) {
```

- [ ] **Step 4: SELLERS (usuarios)**

Reemplazar las cuatro funciones `sellersGet`, `sellersCreate`, `sellersUpdate`, `sellersDelete` por:

```js
// =====================================================
// USUARIOS (tabla sellers)
// =====================================================
const USER_COLS = 'id, name, role, active, created_at, username, pin, password_hash, seller_locations(location_id)'

/** Nunca devolver PIN ni hash al navegador. */
const publicUser = ({ pin, password_hash, ...u }) => ({ ...u, has_pin: !!pin, has_password: !!password_hash })

async function loadPublicUser(tenantId, id) {
  const { data } = await supabaseAdmin.from('sellers').select(USER_COLS).eq('id', id).eq('tenant_id', tenantId).single()
  return data ? publicUser(data) : null
}

/** Columnas de credenciales que aplican al rol final. */
function credentialColumns(role, patch) {
  const c = {}
  if (role === 'admin' || role === 'owner') {
    if (patch.username !== undefined) c.username = normalizeUsername(patch.username)
    if (patch.password) c.password_hash = hashPassword(patch.password)
  } else if (patch.pin !== undefined) {
    c.pin = patch.pin
  }
  return c
}

const actorOf = (auth) => ({ id: auth.seller.id, role: auth.seller.role, locationIds: auth.scope.locationIds })
const duplicateUsername = (e) => e?.code === '23505'

async function sellersGet(req, res) {
  const auth = await requireCan(req, res, 'manage_staff'); if (!auth) return
  const location_id = scopedLocation(auth, req.query.location_id, res, { allowAll: true })
  if (location_id === undefined) return
  const { data, error } = await supabaseAdmin.from('sellers').select(USER_COLS)
    .eq('tenant_id', auth.tenantId).order('name')
  if (error) return res.status(500).json({ error: error.message })
  const isOwner = auth.seller.role === 'owner'
  const rows = (data || []).filter(u => {
    if (!isOwner && !['seller', 'cashier'].includes(u.role)) return false
    const locs = (u.seller_locations || []).map(sl => sl.location_id)
    if (location_id) return locs.includes(location_id)
    return isOwner || locs.some(l => locationInScope(auth.scope, l))
  })
  return res.status(200).json(rows.map(publicUser))
}

async function sellersCreate(req, res) {
  const auth = await requireCan(req, res, 'manage_staff'); if (!auth) return
  const body = req.body || {}
  if (!String(body.name || '').trim()) return res.status(400).json({ error: 'El nombre es requerido' })
  const verdict = checkUserChange({ actor: actorOf(auth), target: null, patch: body })
  if (!verdict.ok) return res.status(verdict.status).json({ error: verdict.error })
  if (verdict.locationIds.some(l => !locationInScope(auth.scope, l))) {
    return res.status(403).json({ error: 'Referencia inválida para esta empresa' })
  }

  const { data: created, error } = await supabaseAdmin.from('sellers')
    .insert({ tenant_id: auth.tenantId, name: String(body.name).trim(), role: verdict.role, ...credentialColumns(verdict.role, body) })
    .select('id').single()
  if (error) {
    return duplicateUsername(error)
      ? res.status(409).json({ error: 'Ese nombre de usuario ya existe' })
      : res.status(500).json({ error: error.message })
  }
  if (verdict.locationIds.length) {
    await supabaseAdmin.from('seller_locations')
      .insert(verdict.locationIds.map(lid => ({ tenant_id: auth.tenantId, seller_id: created.id, location_id: lid })))
  }
  return res.status(201).json(await loadPublicUser(auth.tenantId, created.id))
}

async function updateUser(auth, id, body, res) {
  const { data: row } = await supabaseAdmin.from('sellers')
    .select('id, role, active, username, pin, password_hash, seller_locations(location_id)')
    .eq('id', id).eq('tenant_id', auth.tenantId).single()
  if (!row) return res.status(404).json({ error: 'Usuario no encontrado' })

  const target = {
    id: row.id, role: row.role, active: row.active, username: row.username,
    hasPassword: !!row.password_hash, hasPin: !!row.pin,
    locationIds: (row.seller_locations || []).map(sl => sl.location_id),
  }
  let activeOwnerCount = 0
  if (row.role === 'owner') {
    const { count } = await supabaseAdmin.from('sellers').select('id', { count: 'exact', head: true })
      .eq('tenant_id', auth.tenantId).eq('role', 'owner').eq('active', true)
    activeOwnerCount = count || 0
  }

  const verdict = checkUserChange({ actor: actorOf(auth), target, patch: body, activeOwnerCount })
  if (!verdict.ok) return res.status(verdict.status).json({ error: verdict.error })
  if (verdict.locationIds?.some(l => !locationInScope(auth.scope, l))) {
    return res.status(403).json({ error: 'Referencia inválida para esta empresa' })
  }

  const u = credentialColumns(verdict.role, body)
  if (body.name !== undefined) {
    if (!String(body.name).trim()) return res.status(400).json({ error: 'El nombre es requerido' })
    u.name = String(body.name).trim()
  }
  if (body.role !== undefined)   u.role = verdict.role
  if (body.active !== undefined) u.active = !!body.active

  if (Object.keys(u).length) {
    const { error } = await supabaseAdmin.from('sellers').update(u).eq('id', id).eq('tenant_id', auth.tenantId)
    if (error) {
      return duplicateUsername(error)
        ? res.status(409).json({ error: 'Ese nombre de usuario ya existe' })
        : res.status(500).json({ error: error.message })
    }
  }
  if (verdict.locationIds) {
    await supabaseAdmin.from('seller_locations').delete().eq('seller_id', id).eq('tenant_id', auth.tenantId)
    if (verdict.locationIds.length) {
      await supabaseAdmin.from('seller_locations')
        .insert(verdict.locationIds.map(lid => ({ tenant_id: auth.tenantId, seller_id: id, location_id: lid })))
    }
  }
  return res.status(200).json(await loadPublicUser(auth.tenantId, id))
}

async function sellersUpdate(req, res, id) {
  const auth = await requireCan(req, res, 'manage_staff'); if (!auth) return
  return updateUser(auth, id, req.body || {}, res)
}

// Desactivar pasa por las mismas reglas que editar (último owner, uno mismo, alcance)
async function sellersDelete(req, res, id) {
  const auth = await requireCan(req, res, 'manage_staff'); if (!auth) return
  return updateUser(auth, id, { active: false }, res)
}
```

(Responde `200` con el usuario desactivado en vez de `204`; el frontend no lee el cuerpo de `DELETE /sellers`.)

- [ ] **Step 5: REGISTERS**

```js
async function registersGet(req, res) {
  const auth = await requireAuth(req, res); if (!auth) return
  const location_id = scopedLocation(auth, req.query.location_id, res, { allowAll: true })
  if (location_id === undefined) return
  let q = supabaseAdmin.from('registers')
    .select('id, name, location_id, active, created_at')
    .eq('tenant_id', auth.tenantId).eq('active', true).order('name')
  q = location_id ? q.eq('location_id', location_id) : q.in('location_id', auth.scope.locationIds)
  const { data, error } = await q
  if (error) return res.status(500).json({ error: error.message })
  return res.status(200).json(data || [])
}

async function registersCreate(req, res) {
  const auth = await requireCan(req, res, 'manage_registers'); if (!auth) return
  const { name, location_id } = req.body || {}
  if (!name?.trim() || !location_id) return res.status(400).json({ error: 'name y location_id requeridos' })
  if (denyOutOfScope(auth, location_id, res)) return
  const { data, error } = await supabaseAdmin.from('registers')
    .insert({ tenant_id: auth.tenantId, name: name.trim(), location_id, active: true }).select().single()
  if (error) return res.status(500).json({ error: error.message })
  return res.status(201).json(data)
}

async function registersUpdate(req, res, id) {
  const auth = await requireCan(req, res, 'manage_registers'); if (!auth) return
  if (!(await loadScopedRegister(auth, id, res))) return
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
  const auth = await requireCan(req, res, 'manage_registers'); if (!auth) return
  if (!(await loadScopedRegister(auth, id, res))) return
  await supabaseAdmin.from('registers').update({ active: false }).eq('id', id).eq('tenant_id', auth.tenantId)
  return res.status(200).json({ ok: true })
}
```

- [ ] **Step 6: CIERRES DE CAJA**

```js
async function closuresSummary(req, res) {
  const auth = await requireCan(req, res, 'cash_session'); if (!auth) return
  const location_id = scopedLocation(auth, req.query.location_id, res)
  if (location_id === undefined) return
  const { register_id } = req.query
  if (register_id) {
    const reg = await loadScopedRegister(auth, register_id, res); if (!reg) return
    if (reg.location_id !== location_id) return res.status(403).json({ error: 'La caja no pertenece a este punto de venta' })
  }
  let expected
  try { expected = await closureExpected(auth, { register_id, location_id }) }
  catch (e) { return res.status(500).json({ error: e.message }) }
  let existing = null
  if (register_id) {
    const { data } = await supabaseAdmin.from('register_closures')
      .select('*').eq('tenant_id', auth.tenantId)
      .eq('register_id', register_id).eq('business_date', expected.date).limit(1)
    existing = data?.[0] || null
  }
  return res.status(200).json({ ...expected, existing })
}

async function closuresCreate(req, res) {
  const auth = await requireCan(req, res, 'cash_session'); if (!auth) return
  const { register_id, register_name, declared_cash, notes } = req.body || {}
  const location_id = scopedLocation(auth, req.body?.location_id, res)
  if (location_id === undefined) return
  const declared = Number(declared_cash)
  if (isNaN(declared) || declared < 0) return res.status(400).json({ error: 'El efectivo contado debe ser un número válido' })
  if (register_id) {
    const reg = await loadScopedRegister(auth, register_id, res); if (!reg) return
    if (reg.location_id !== location_id) return res.status(403).json({ error: 'La caja no pertenece a este punto de venta' })
  }

  let expected
  try { expected = await closureExpected(auth, { register_id, location_id }) }
  catch (e) { return res.status(500).json({ error: e.message }) }

  const { data, error } = await supabaseAdmin.from('register_closures').insert({
    tenant_id:         auth.tenantId,
    location_id,
    register_id:       register_id || null,
    register_name:     register_name || null,
    cashier_id:        auth.seller.id,
    cashier_name:      auth.seller.name,
    business_date:     expected.date,
    expected_cash:     expected.expected_cash,
    expected_transfer: expected.expected_transfer,
    expected_card:     expected.expected_card,
    declared_cash:     declared,
    difference:        declared - expected.expected_cash,
    invoice_count:     expected.invoice_count,
    notes:             notes?.trim() || null,
  }).select().single()
  if (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'Esta caja ya fue cerrada hoy' })
    return res.status(500).json({ error: closuresErrMsg(error) })
  }
  return res.status(201).json(data)
}

async function closuresList(req, res) {
  const auth = await requireCan(req, res, 'cash_session'); if (!auth) return
  let range
  try { range = parseRange(req.query) } catch (e) { return res.status(e.status || 400).json({ error: e.message }) }
  const location_id = scopedLocation(auth, req.query.location_id, res, { allowAll: true })
  if (location_id === undefined) return
  let q = supabaseAdmin.from('register_closures').select('*')
    .eq('tenant_id', auth.tenantId)
    .gte('business_date', range.from).lte('business_date', range.to)
    .order('closed_at', { ascending: false }).limit(100)
  q = location_id ? q.eq('location_id', location_id) : q.in('location_id', auth.scope.locationIds)
  const { data, error } = await q
  if (error) return res.status(500).json({ error: closuresErrMsg(error) })
  return res.status(200).json(data || [])
}
```

- [ ] **Step 7: INVOICES**

En `invoicesCreate` reemplazar las líneas desde `const auth = ...` hasta el `tenantOwns('sellers', ...)` inclusive por:

```js
  const auth = await requireCan(req, res, 'sell'); if (!auth) return
  const { seller_id, seller_name, location_name, items, client_op_id } = req.body || {}
  if (!seller_id || !Array.isArray(items) || !items.length) return res.status(400).json({ error: 'location_id, seller_id e items requeridos' })
  if (client_op_id != null && !UUID_RE.test(String(client_op_id))) {
    return res.status(400).json({ error: 'client_op_id inválido' })
  }
  const location_id = scopedLocation(auth, req.body?.location_id, res)
  if (location_id === undefined) return
  if (!(await tenantOwns('sellers', seller_id, auth.tenantId))) return res.status(403).json({ error: 'Referencia inválida para esta empresa' })
```

En `invoicesPending` e `invoicesGetByCode` reemplazar:

```js
  const { location_id } = req.query
  if (!location_id) return res.status(400).json({ error: 'location_id requerido' })
```

por:

```js
  const location_id = scopedLocation(auth, req.query.location_id, res)
  if (location_id === undefined) return
```

En `invoicesPay` reemplazar las 3 primeras líneas del cuerpo por:

```js
  const auth = await requireCan(req, res, 'charge'); if (!auth) return
  const { pay_method, observations, register_id, register_name, discount, transfer_provider } = req.body || {}
  const location_id = scopedLocation(auth, req.body?.location_id, res)
  if (location_id === undefined) return
  if (!pay_method) return res.status(400).json({ error: 'location_id y pay_method requeridos' })
  if (!['cash', 'transfer', 'card'].includes(pay_method)) return res.status(400).json({ error: 'pay_method inválido' })
  if (register_id) {
    const reg = await loadScopedRegister(auth, register_id, res); if (!reg) return
    if (reg.location_id !== location_id) return res.status(403).json({ error: 'La caja no pertenece a este punto de venta' })
  }
```

En `invoicesCancel` reemplazar las 3 primeras líneas por:

```js
  const auth = await requireCan(req, res, 'charge'); if (!auth) return
  const location_id = scopedLocation(auth, req.body?.location_id, res)
  if (location_id === undefined) return
```

En `invoicesEdit` reemplazar las 4 primeras líneas por:

```js
  const auth = await requireCan(req, res, 'charge'); if (!auth) return
  const { items, observations } = req.body || {}
  const location_id = scopedLocation(auth, req.body?.location_id, res)
  if (location_id === undefined) return
```

En `invoicesRefund` reemplazar las 2 primeras líneas por:

```js
  const auth = await requireCan(req, res, 'refund'); if (!auth) return
  const { data: inv } = await supabaseAdmin.from('invoices')
    .select('id, location_id').eq('id', id).eq('tenant_id', auth.tenantId).single()
  if (!inv) return res.status(404).json({ error: 'Factura no encontrada' })
  if (denyOutOfScope(auth, inv.location_id, res)) return
```

Reemplazar `invoicesHistory` completo:

```js
async function invoicesHistory(req, res) {
  const auth = await requireCan(req, res, 'charge'); if (!auth) return
  const { status, seller_id, limit = '50', offset = '0' } = req.query
  let range
  try { range = parseRange(req.query) } catch (e) { return res.status(e.status || 400).json({ error: e.message }) }
  const location_id = scopedLocation(auth, req.query.location_id, res, { allowAll: true })
  if (location_id === undefined) return
  const bounds = bogotaDayBounds(range.from, range.to)
  let q = supabaseAdmin.from('invoices')
    .select('*', { count: 'exact' })
    .eq('tenant_id', auth.tenantId)
    .gte('created_at', bounds.start).lt('created_at', bounds.end).order('created_at', { ascending: false })
    .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1)
  q = location_id ? q.eq('location_id', location_id) : q.in('location_id', auth.scope.locationIds)
  if (status) q = q.eq('status', status)
  if (seller_id) q = q.eq('seller_id', seller_id)
  const { data, error, count } = await q
  if (error) return res.status(500).json({ error: error.message })
  return res.status(200).json({ invoices: data || [], total: count || 0 })
}
```

- [ ] **Step 8: REPORTS**

En `reportDaily`, `reportSellers`, `reportRegisters`, `reportTopProducts`, `reportSellerDetail`: primera línea →

```js
  const auth = await requireCan(req, res, 'view_reports'); if (!auth) return
```

y en cada una reemplazar la lectura de `location_id` desde `req.query` (`const { location_id } = req.query`, o sacar `location_id` del destructuring de `req.query` en `reportTopProducts`/`reportSellerDetail`) agregando, **después** del `parseRange`:

```js
  const location_id = scopedLocation(auth, req.query.location_id, res, { allowAll: true })
  if (location_id === undefined) return
```

Los usos existentes `p_location_id: location_id || null` quedan igual. En `reportDaily` la condición `if (!location_id) {` (comparativo por punto) queda correcta: solo el owner recibe `null`.

`reportLocations`: primera línea →

```js
  const auth = await requireCan(req, res, 'view_consolidated'); if (!auth) return
```

`reportRegisterDetail`: primera línea `requireCan(req, res, 'view_reports')`; reemplazar la carga de la caja y el 404 por:

```js
  const register = await loadScopedRegister(auth, register_id, res); if (!register) return
  const location_id = register.location_id
```

y quitar `location_id` del destructuring de `req.query`.

- [ ] **Step 9: Verificar que no queda ningún `requireAdmin` ni `location_id` sin alcance**

Run: `grep -n "requireAdmin\|= req.query$\|const { location_id } = req" "api/[[...path]].js"`
Expected: sin resultados.

Run: `grep -n "requireAuth(req, res)" "api/[[...path]].js"`
Expected: solo `locationsGet`, `productsGet`, `registersGet`, `invoicesPending`, `invoicesGetByCode`.

Run: `node -e "import('./api/[[...path]].js').then(()=>console.log('ok'))"`
Expected: `ok` (puede avisar de variables de Supabase no configuradas).

- [ ] **Step 10: Commit (Task 4 + Task 5)**

```bash
git add api/_lib/auth.js api/_lib/adminLogin.js "api/[[...path]].js"
git commit -m "feat(api): login administrativo y candados de rol y punto de venta en todos los endpoints"
```

---

### Task 6: Panel de plataforma crea al Superadministrador

**Files:**
- Modify: `api/_lib/superRoutes.js` (`superTenantsCreate`, `superTenantAdminCreate`)
- Modify: `src/pages/SuperDashboard.jsx:31-45,103-117`

**Interfaces:**
- Consumes: `validateUsername`, `validatePassword`, `hashPassword` (Task 3).
- Produces: `POST /super/tenants` acepta `owner: { name, username, password }` (reemplaza `admin: {name, pin}`); `POST /super/tenants/:id/admin` acepta `{ name, username, password }` y crea `role: 'owner'`.

- [ ] **Step 1: API**

Agregar a los imports de `superRoutes.js`:

```js
import { DUMMY_HASH, validateUsername, validatePassword, hashPassword } from './passwords.js'
```

(fusionar con el import de `DUMMY_HASH` del Task 3). Agregar helper arriba de `superTenantsCreate`:

```js
/** Valida {name, username, password} del superadministrador; devuelve fila o {error}. */
function ownerRow(tenantId, o) {
  if (!o?.name?.trim()) return { error: 'El superadministrador requiere nombre' }
  const u = validateUsername(o.username); if (!u.ok) return { error: u.error }
  const p = validatePassword(o.password); if (!p.ok) return { error: p.error }
  return { row: { tenant_id: tenantId, name: o.name.trim(), username: u.username, password_hash: hashPassword(o.password), role: 'owner' } }
}
```

En `superTenantsCreate`:
- Cambiar `const { name, slug: rawSlug, license_start, license_end, admin, location } = req.body || {}` por `const { name, slug: rawSlug, license_start, license_end, owner, location } = req.body || {}`.
- Reemplazar la validación `if (admin && (...PIN...))` por:

```js
  if (owner) {
    const check = ownerRow('00000000-0000-0000-0000-000000000000', owner)
    if (check.error) return res.status(400).json({ error: check.error })
  }
```

- Reemplazar el bloque `if (admin) { ... insert ... }` por:

```js
  if (owner) {
    const { row } = ownerRow(tenant.id, owner)
    const { error: se } = await supabaseAdmin.from('sellers').insert(row)
    if (se) return res.status(500).json({ error: `Cliente creado pero falló el superadministrador: ${se.message}` })
  }
```

Reemplazar `superTenantAdminCreate`:

```js
export async function superTenantAdminCreate(req, res, tenantId) {
  const auth = await requireSuperAdmin(req, res); if (!auth) return
  const { data: tenant } = await supabaseAdmin.from('tenants').select('id').eq('id', tenantId).single()
  if (!tenant) return res.status(404).json({ error: 'Empresa no encontrada' })
  const { row, error: invalid } = ownerRow(tenantId, req.body)
  if (invalid) return res.status(400).json({ error: invalid })
  const { data, error } = await supabaseAdmin.from('sellers').insert(row).select('id, name, role, username').single()
  if (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'Ese nombre de usuario ya existe en la empresa' })
    return res.status(500).json({ error: error.message })
  }
  return res.status(201).json(data)
}
```

- [ ] **Step 2: Wizard en `SuperDashboard.jsx`**

Reemplazar los estados `adminName`/`adminPin` (líneas 31-32) por:

```jsx
  const [ownerName,  setOwnerName]  = useState('')
  const [ownerUser,  setOwnerUser]  = useState('')
  const [ownerPass,  setOwnerPass]  = useState('')
```

Línea 45:

```jsx
      if (ownerName.trim()) body.owner = { name: ownerName.trim(), username: ownerUser.trim(), password: ownerPass }
```

Reemplazar el bloque "Primer administrador (opcional)" (líneas 103-112) por:

```jsx
            <div className="border-t border-white/10 pt-4">
              <p className="text-gray-400 text-sm mb-1">Superadministrador de la empresa</p>
              <p className="text-gray-400 text-xs mb-3">Ve todos los puntos y crea a los administradores. Entra con usuario y contraseña.</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <input value={ownerName} onChange={e => setOwnerName(e.target.value)} placeholder="Nombre"
                  className="w-full px-3 py-2.5 rounded-xl bg-surface-400 border-2 border-white/10 text-white focus:border-brand-500 focus:outline-none" />
                <input value={ownerUser} onChange={e => setOwnerUser(e.target.value.toLowerCase())} placeholder="Usuario"
                  autoComplete="off" className="w-full px-3 py-2.5 rounded-xl bg-surface-400 border-2 border-white/10 text-white focus:border-brand-500 focus:outline-none" />
                <input type="password" value={ownerPass} onChange={e => setOwnerPass(e.target.value)} placeholder="Contraseña (mín. 10)"
                  autoComplete="new-password" className="w-full px-3 py-2.5 rounded-xl bg-surface-400 border-2 border-white/10 text-white focus:border-brand-500 focus:outline-none" />
              </div>
            </div>
```

Y el `disabled` del botón Crear (línea 116):

```jsx
              <button type="submit" disabled={loading || (ownerName.trim() !== '' && (ownerUser.trim().length < 3 || ownerPass.length < 10))}
```

Si `SuperDashboard.jsx` tiene otro formulario que llame `/super/tenants/:id/admin` con `pin`, cambiarlo a los mismos tres campos. Verificar con:

Run: `grep -n "/admin'\|/admin\`\|adminPin\|pin" src/pages/SuperDashboard.jsx`
Expected: sin resultados tras el cambio.

- [ ] **Step 3: Verificar**

Run: `npm test && npm run build`
Expected: tests PASS, build sin errores.

- [ ] **Step 4: Commit**

```bash
git add api/_lib/superRoutes.js src/pages/SuperDashboard.jsx
git commit -m "feat(super): el primer usuario de cada empresa es un superadministrador con usuario y contraseña"
```

---

### Task 7: Frontend — sesión, ingreso administrativo y navegación por rol

**Files:**
- Modify: `src/store/authStore.js`, `src/pages/LoginPage.jsx`, `src/App.jsx`, `src/components/Topbar.jsx`

**Interfaces:**
- Consumes: `POST /auth/admin-login` (Task 4); `can`, `ROLE_LABELS` desde `../../api/_lib/roles.js`.
- Produces (store): `locations: Location[]`, `login(seller, location, tenant, token, locations?)`, `setLocation(location|null)`.

- [ ] **Step 1: Store**

En `src/store/authStore.js`:
- Agregar estado `locations: [],   // puntos a los que tiene acceso (admin/owner)`.
- Cambiar `login`:

```js
      login: (seller, location, tenant, token, locations = location ? [location] : []) => {
        localStorage.setItem('pv_token', token)
        if (tenant?.slug) localStorage.setItem('pv_tenant_slug', tenant.slug)
        set({ seller, location, tenant, token, locations, register: null })
```

(el resto del cuerpo igual).
- Agregar acción:

```js
      // Solo owner cambia de punto; null = modo administración de toda la empresa
      setLocation: (location) => set({ location, register: null }),
```

- `logout`: `set({ seller: null, location: null, locations: [], register: null, token: null })`.
- `partialize`: agregar `locations: state.locations,`.

- [ ] **Step 2: LoginPage — ingreso administrativo**

Agregar a los imports de `LoginPage.jsx`: `KeyRound` en el import de `lucide-react`.

Nuevos estados junto a los existentes:

```jsx
  const [adminUser,    setAdminUser]    = useState('')
  const [adminPass,    setAdminPass]    = useState('')
  const [adminData,    setAdminData]    = useState(null) // respuesta de /auth/admin-login
```

`step` admite además `'admin'` y `'admin-location'`.

Handlers nuevos (debajo de `handleSkipRegister`):

```jsx
  const handleAdminLogin = async (e) => {
    e.preventDefault()
    if (!adminUser.trim() || !adminPass) return
    setLoading(true)
    try {
      const data = await api.post('/auth/admin-login', {
        tenant_slug: tenant.slug, username: adminUser.trim(), password: adminPass,
      }, { retries: 0 })
      setAdminPass('')
      if (data.seller.role === 'admin') {
        await login(data.seller, data.locations[0], data.tenant, data.token, data.locations)
        navigate('/admin')
        return
      }
      setAdminData(data)
      setStep('admin-location')
    } catch (err) {
      toastError(err.message || 'Usuario o contraseña incorrectos')
      setAdminPass('')
    } finally {
      setLoading(false)
    }
  }

  // Owner: elegir un punto para vender/cobrar, o entrar a administrar toda la empresa
  const handleOwnerEnter = async (loc) => {
    const d = adminData
    await login(d.seller, loc, d.tenant, d.token, d.locations)
    navigate('/admin')
  }
```

(`api.post(path, body, { retries, timeout })` ya existe: lo usa `BulkDelete.jsx`. `retries: 0` evita que un reintento automático gaste intentos del bloqueo por contraseña.)

En el paso `'location'`, debajo del botón "Cambiar de empresa", agregar:

```jsx
              <button
                type="button"
                onClick={() => { setAdminUser(''); setAdminPass(''); setStep('admin') }}
                className="text-xs text-gray-400 hover:text-white transition-colors mt-2 w-full text-center inline-flex items-center justify-center gap-1.5"
              >
                <KeyRound className="w-3.5 h-3.5" /> Ingreso administrativo
              </button>
```

Nuevos pasos, antes del comentario `{/* ---- Paso 3: Seleccionar caja`:

```jsx
          {/* ---- Ingreso administrativo ---- */}
          {!bootLoading && step === 'admin' && (
            <form onSubmit={handleAdminLogin} className="animate-fade-in space-y-4">
              <button type="button" onClick={() => setStep('location')}
                className="flex items-center gap-1.5 text-gray-400 hover:text-white text-sm transition-colors">
                <ArrowLeft className="w-4 h-4" /> <span>Volver</span>
              </button>
              <div>
                <h2 className="font-syne text-lg font-semibold text-white mb-1">Ingreso administrativo</h2>
                <p className="text-gray-400 text-sm">Para administradores y superadministradores.</p>
              </div>
              <div>
                <label htmlFor="admin-user" className="block text-xs text-gray-400 mb-1">Usuario</label>
                <input id="admin-user" value={adminUser} onChange={e => setAdminUser(e.target.value)}
                  autoComplete="username" autoCapitalize="none" autoFocus
                  className="w-full px-4 py-3 rounded-xl bg-surface-400 border-2 border-white/10 text-white focus:border-brand-500 focus:outline-none" />
              </div>
              <div>
                <label htmlFor="admin-pass" className="block text-xs text-gray-400 mb-1">Contraseña</label>
                <input id="admin-pass" type="password" value={adminPass} onChange={e => setAdminPass(e.target.value)}
                  autoComplete="current-password"
                  className="w-full px-4 py-3 rounded-xl bg-surface-400 border-2 border-white/10 text-white focus:border-brand-500 focus:outline-none" />
              </div>
              <button type="submit" disabled={loading || !adminUser.trim() || !adminPass} className="btn btn-primary btn-lg w-full">
                {loading
                  ? <span className="flex items-center gap-2"><Loader2 className="animate-spin h-4 w-4" /> Verificando...</span>
                  : <span className="inline-flex items-center gap-2"><ShieldCheck className="w-4 h-4" /> Ingresar</span>}
              </button>
            </form>
          )}

          {/* ---- Superadministrador: dónde trabajar ---- */}
          {!bootLoading && step === 'admin-location' && adminData && (
            <div className="animate-fade-in space-y-4">
              <div>
                <h2 className="font-syne text-lg font-semibold text-white mb-1">Hola, {adminData.seller.name}</h2>
                <p className="text-gray-400 text-sm">Administra toda la empresa o elige un punto para vender y cobrar.</p>
              </div>
              <button onClick={() => handleOwnerEnter(null)} className="btn btn-primary btn-lg w-full">
                Administrar todos los puntos <ArrowRight className="w-4 h-4" />
              </button>
              <LocationSelector locations={adminData.locations} value={null} onChange={handleOwnerEnter} />
            </div>
          )}
```

- [ ] **Step 3: Guardas de ruta en `App.jsx`**

```jsx
import { can } from '../api/_lib/roles.js'
```

Reemplazar `RequireRole` por:

```jsx
// ---- Guard por acción (roles.js) ---------------------------
function RequireCan({ action, needsLocation = false, children }) {
  const seller   = useAuthStore(s => s.seller)
  const location = useAuthStore(s => s.location)
  if (!seller) return <Navigate to="/login" replace />
  if (!can(seller.role, action)) return <Navigate to="/login" replace />
  // El superadmin en modo "todos los puntos" debe elegir uno para operar
  if (needsLocation && !location) return <Navigate to="/admin" replace />
  return children
}
```

Rutas:

```jsx
        <Route path="/vender" element={
          <RequireCan action="sell" needsLocation>
            <VendedorPage />
          </RequireCan>
        } />

        <Route path="/caja" element={
          <RequireCan action="charge" needsLocation>
            <CajaPage />
          </RequireCan>
        } />

        <Route path="/admin" element={
          <RequireCan action="view_reports">
            <AdminPage />
          </RequireCan>
        } />
```

- [ ] **Step 4: Topbar**

En `src/components/Topbar.jsx`:

```jsx
import { can, ROLE_LABELS } from '../../api/_lib/roles.js'
```

Borrar la constante local `ROLE_LABELS` (línea 7). Del store tomar también `locations, setLocation`:

```jsx
  const { seller, location, locations, register, logout, setLocation } = useAuthStore()
```

Reemplazar `navLinks`:

```jsx
  const navLinks = useMemo(() => {
    const role = seller?.role
    const links = []
    if (can(role, 'view_reports')) links.push({ label: 'Admin', path: '/admin' })
    // Vender y Caja necesitan un punto elegido
    if (location && can(role, 'sell'))   links.push({ label: 'Vender', path: '/vender' })
    if (location && can(role, 'charge')) links.push({ label: 'Caja', path: '/caja' })
    return links
  }, [seller?.role, location])
```

Cambiar las dos apariciones de `seller.role === 'admin' && <Shield` por `can(seller.role, 'view_reports') && <Shield`.

Selector de punto para owner — reemplazar el bloque `{location && ( <div className="hidden sm:flex ...`:

```jsx
        {seller?.role === 'owner' && locations.length > 0 ? (
          <label className="hidden sm:flex items-center gap-1.5 bg-brand-500/15 border border-brand-500/30 rounded-lg px-2 py-1 max-w-[240px]">
            <MapPin className="w-3.5 h-3.5 text-brand-400 shrink-0" />
            <span className="sr-only">Punto de venta</span>
            <select
              value={location?.id || ''}
              onChange={e => {
                const next = locations.find(l => l.id === e.target.value) || null
                setLocation(next)
                if (!next && route.pathname !== '/admin') navigate('/admin')
              }}
              className="bg-transparent text-brand-300 text-xs font-medium focus:outline-none max-w-[190px]"
            >
              <option value="">Todos los puntos</option>
              {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </label>
        ) : location && (
          <div className="hidden sm:flex items-center gap-1.5 bg-brand-500/15 border border-brand-500/30 rounded-lg px-2.5 py-1.5 max-w-[220px]">
            <MapPin className="w-3.5 h-3.5 text-brand-400 shrink-0" />
            <span className="text-brand-400 text-xs font-medium truncate">
              {location.name}
              {register && <span className="text-brand-300/60"> · {register.name}</span>}
            </span>
          </div>
        )}
```

En el drawer móvil, reemplazar el bloque `{location && ( <div className="flex items-center gap-2 bg-brand-500/10 ...` por el mismo patrón con clases `flex items-center gap-2 bg-brand-500/10 border border-brand-500/25 rounded-lg px-3 py-2` y `select` con `text-sm text-brand-300 bg-transparent w-full`.

- [ ] **Step 5: CajaPage — el superadmin también edita facturas**

En `src/pages/CajaPage.jsx` agregar `import { can } from '../../api/_lib/roles.js'` y reemplazar la línea 202:

```jsx
  const canEdit = can(seller?.role, 'charge')
```

Run: `grep -rn "role === 'admin'\|role !== 'admin'\|'admin')" src`
Expected: sin resultados (todo pasa por `can`).

- [ ] **Step 6: Verificar build**

Run: `npm run build`
Expected: sin errores. (Vite resuelve `../api/_lib/roles.js` porque está dentro de la raíz del proyecto.)

- [ ] **Step 7: Commit**

```bash
git add src/store/authStore.js src/pages/LoginPage.jsx src/App.jsx src/components/Topbar.jsx src/pages/CajaPage.jsx
git commit -m "feat(ui): ingreso administrativo con usuario y contraseña y navegación por rol"
```

---

### Task 8: AdminPage por rol (comparativo solo owner, usuarios, puntos)

**Files:**
- Modify: `src/pages/AdminPage.jsx`

**Interfaces:**
- Consumes: `can`, `ROLE_LABELS`, `assignableRoles` desde `../../api/_lib/roles.js`; store `seller`; `GET /sellers` con `has_pin`/`has_password`/`username` (Task 5).

- [ ] **Step 1: Pestañas según rol**

Import:

```jsx
import { can, ROLE_LABELS, assignableRoles } from '../../api/_lib/roles.js'
```

Reemplazar `TABS` por:

```jsx
const TABS = [
  { id: 'resumen',    label: 'Resumen',    icon: '📊', action: 'view_reports' },
  { id: 'vendedores', label: 'Usuarios',   icon: '👥', action: 'manage_staff' },
  { id: 'cajas',      label: 'Cajas',      icon: '🖥', action: 'manage_registers' },
  { id: 'locaciones', label: 'Puntos',     icon: '📍', action: 'configure_printer' },
  { id: 'productos',  label: 'Productos',  icon: '🎆', action: 'manage_catalog' },
  { id: 'historial',  label: 'Historial',  icon: '📋', action: 'view_reports' },
]
```

En `AdminPage`:

```jsx
  const { location: authLocation, seller } = useAuthStore()
  const role = seller?.role
  const tabs = TABS.filter(t => can(role, t.action))
  const isOwner = can(role, 'view_consolidated')
```

Reemplazar `TABS.map` / `TABS.find` del render por `tabs.map` / `tabs.find`, y pasar `isOwner` a `ResumenTab`, `VendedoresTab`, `LocacionesTab`. Estado inicial de `locationId`:

```jsx
  // Admin: fijo en su punto. Owner: el punto elegido en la barra ('' = consolidado).
  const [locationId, setLocationId] = useState(authLocation?.id || '')
```

y cuando el owner cambie de punto en la barra:

```jsx
  useEffect(() => { if (isOwner) setLocationId(authLocation?.id || '') }, [authLocation?.id, isOwner])
```

- [ ] **Step 2: ResumenTab sin comparativo para admin**

Firma: `function ResumenTab({ from, to, setRange, locationId, setLocationId, locations, isOwner })`.

En `fetchAll` envolver la carga del comparativo:

```jsx
    if (isOwner) {
      setLoadLoc(true)
      api.get(`/reports/locations?from=${from}&to=${to}`)
        .then(d => setLocCompar(d || []))
        .catch(() => {})
        .finally(() => setLoadLoc(false))
    }
```

y agregar `isOwner` a las dependencias del `useCallback`.

Envolver el `<div>` del selector "Punto de venta" con `{isOwner && ( ... )}`.

Cambiar la condición del comparativo:

```jsx
      {isOwner && !locationId && (
```

- [ ] **Step 3: Usuarios**

En `VendedoresTab({ locations, isOwner })`:
- Título `Usuarios`.
- Borrar la constante local `ROLE_LABEL` y usar `ROLE_LABELS`.
- Línea de detalle (antes `· PIN: {s.pin}`):

```jsx
                <p className="text-xs text-gray-400">
                  {ROLE_LABELS[s.role]}
                  {s.username && <> · <span className="font-mono">{s.username}</span></>}
                  {!isOwner || s.role === 'owner' ? null : <> · {(s.seller_locations || []).map(sl => locations.find(l => l.id === sl.location_id)?.name).filter(Boolean).join(', ') || 'Sin punto'}</>}
                </p>
```

Reemplazar `SellerForm` completo:

```jsx
function SellerForm({ seller, locations, onClose, onSave }) {
  const { error: toastError } = useToast()
  const { seller: me } = useAuthStore()
  const titleId = useId()
  const panelRef = useModalA11y(onClose)
  const roleOptions = assignableRoles(me?.role)
  const isSelf = seller?.id === me?.id

  const [name,     setName]     = useState(seller?.name || '')
  const [role,     setRole]     = useState(seller?.role || 'seller')
  const [pin,      setPin]      = useState('')
  const [username, setUsername] = useState(seller?.username || '')
  const [password, setPassword] = useState('')
  const [locIds,   setLocIds]   = useState((seller?.seller_locations || []).map(sl => sl.location_id))
  const [saving,   setSaving]   = useState(false)

  const usesPassword = role === 'admin' || role === 'owner'
  const needsLocations = role !== 'owner'
  const singleLocation = role === 'admin'
  // El admin solo tiene su punto: se asigna solo, sin mostrar selección
  const showLocations = needsLocations && locations.length > 1

  const toggleLoc = (lid) => setLocIds(prev =>
    singleLocation ? [lid] : prev.includes(lid) ? prev.filter(x => x !== lid) : [...prev, lid])

  const handleSave = async () => {
    if (!name.trim()) return toastError('El nombre es requerido')
    const body = { name: name.trim() }
    if (!isSelf) body.role = role
    if (usesPassword) {
      if (username !== (seller?.username || '')) body.username = username
      if (password) body.password = password
    } else if (pin) {
      body.pin = pin
    }
    if (!isSelf && needsLocations) {
      body.location_ids = locations.length === 1 ? [locations[0].id] : locIds
    }
    setSaving(true)
    try {
      if (seller?.id) await api.put(`/sellers/${seller.id}`, body)
      else            await api.post('/sellers', body)
      onSave()
    } catch (err) { toastError(err.message) }
    finally { setSaving(false) }
  }

  const needsNewPin = !usesPassword && !seller?.has_pin
  const needsNewPass = usesPassword && !seller?.has_password

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={onClose}>
      <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}
        className="card bg-surface-200 w-full max-w-md space-y-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <h3 id={titleId} className="font-syne font-semibold text-white">{seller ? 'Editar usuario' : 'Nuevo usuario'}</h3>

        <input placeholder="Nombre" value={name} onChange={e => setName(e.target.value)} className="input" />

        <div>
          <label className="block text-xs text-gray-400 mb-1">Rol</label>
          <select value={role} onChange={e => setRole(e.target.value)} className="input" disabled={isSelf}>
            {roleOptions.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
          </select>
          {isSelf && <p className="text-xs text-gray-400 mt-1">No puedes cambiar tu propio rol.</p>}
        </div>

        {usesPassword ? (
          <>
            <input placeholder="Usuario (ej: admin.norte)" value={username} autoComplete="off" autoCapitalize="none"
              onChange={e => setUsername(e.target.value.toLowerCase())} className="input font-mono" />
            <input type="password" autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)}
              placeholder={needsNewPass ? 'Contraseña (mínimo 10 caracteres)' : 'Nueva contraseña (dejar vacío para no cambiar)'}
              className="input" />
          </>
        ) : (
          <input placeholder={needsNewPin ? 'PIN (4 dígitos)' : 'Nuevo PIN (dejar vacío para no cambiar)'} maxLength={4} value={pin}
            inputMode="numeric" onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))} className="input font-mono" />
        )}

        {showLocations && !isSelf && (
          <fieldset>
            <legend className="text-xs text-gray-400 mb-2">{singleLocation ? 'Punto de venta que administra' : 'Puntos de venta asignados'}</legend>
            <div className="space-y-1">
              {locations.map(l => (
                <label key={l.id} className="flex items-center gap-2 cursor-pointer">
                  <input type={singleLocation ? 'radio' : 'checkbox'} name="seller-locs"
                    checked={locIds.includes(l.id)} onChange={() => toggleLoc(l.id)} className="accent-brand-500" />
                  <span className="text-sm text-gray-300">{l.name}</span>
                </label>
              ))}
            </div>
          </fieldset>
        )}

        {role === 'owner' && (
          <p className="text-xs text-amber-300">El superadministrador ve y administra todos los puntos de la empresa.</p>
        )}

        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="btn btn-ghost">Cancelar</button>
          <button onClick={handleSave} disabled={saving} className="btn btn-primary">
            {saving ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  )
}
```

En `VendedoresTab`, ocultar el botón "Desactivar" para el propio usuario:

```jsx
                {s.id !== me?.id && (
                  <button onClick={() => handleToggle(s)} ...>...</button>
                )}
```

con `const { seller: me } = useAuthStore()` al inicio de `VendedoresTab`.

- [ ] **Step 4: Puntos de venta — admin solo impresora**

`LocacionesTab({ locations, setLocations, isOwner })`: envolver el botón `+ Nuevo` y el botón `Desactivar/Activar` con `{isOwner && ( ... )}`; pasar `isOwner` a `LocationForm`.

En `LocationForm({ location, onClose, onSave, isOwner })`:
- Inputs de nombre y dirección con `disabled={!isOwner}`.
- En `handleSave`, la rama de edición:

```jsx
      if (location?.id) {
        await api.put(`/locations/${location.id}`, isOwner ? { name, address: addr, printer_config } : { printer_config })
      } else {
```

- [ ] **Step 5: Filtros de punto en Cajas e Historial**

En `ClosuresSection`, `HistorialTab` y el formulario de caja (`RegisterForm`, que tiene el `select` de punto usando `locationId`): envolver el `<div>` del selector "Punto de venta" con `{locations.length > 1 && ( ... )}`. `GET /locations` ya devuelve solo los puntos del alcance, así que un admin nunca ve el selector.

- [ ] **Step 6: Verificar build**

Run: `npm run build`
Expected: sin errores.

- [ ] **Step 7: Commit**

```bash
git add src/pages/AdminPage.jsx
git commit -m "feat(admin): panel por rol — sin comparativo para admin de punto, usuarios con credenciales y catálogo solo superadmin"
```

---

### Task 9: Tests de matriz rol × endpoint contra el router

**Files:**
- Create: `api/_lib/__tests__/fakeSupabase.js`, `api/_lib/__tests__/scopeMatrix.test.js`

**Interfaces:**
- Consumes: router por defecto `api/[[...path]].js`, `signToken` (jwt.js).
- Produces: `createFakeSupabase(resolver) → { from, rpc, calls }` donde `resolver(q)` recibe `q = { table, op, filters: [[method, col, value]], single, payload } | { rpc, params }` y devuelve `{ data, error, count? }`.

- [ ] **Step 1: Doble de Supabase**

`api/_lib/__tests__/fakeSupabase.js`:

```js
// Doble mínimo del query builder de supabase-js para tests del router.
// Cada from() registra filtros; al hacer await se pregunta al resolver.

const FILTERS = ['eq', 'in', 'gte', 'lt', 'lte', 'neq']
const WRITES  = ['insert', 'update', 'delete', 'upsert']

export function createFakeSupabase(resolver) {
  const calls = []

  function from(table) {
    const q = { table, op: 'select', filters: [], single: false, payload: undefined }
    calls.push(q)
    const chain = new Proxy({}, {
      get(_, prop) {
        if (prop === 'then') {
          return (resolve, reject) => Promise.resolve().then(() => resolver(q)).then(resolve, reject)
        }
        return (...args) => {
          if (FILTERS.includes(prop)) q.filters.push([prop, ...args])
          else if (WRITES.includes(prop)) { q.op = prop; q.payload = args[0] }
          else if (prop === 'single' || prop === 'maybeSingle') q.single = true
          return chain
        }
      },
    })
    return chain
  }

  function rpc(fn, params) {
    const q = { rpc: fn, params }
    calls.push(q)
    return Promise.resolve().then(() => resolver(q))
  }

  return { from, rpc, calls }
}

/** Valor del primer filtro `method` sobre `col`, o undefined. */
export const filterValue = (q, method, col) => q.filters.find(f => f[0] === method && f[1] === col)?.[2]
```

- [ ] **Step 2: Tests de matriz**

`api/_lib/__tests__/scopeMatrix.test.js`:

```js
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'
import { createFakeSupabase, filterValue } from './fakeSupabase.js'

const TENANT_ID = '00000000-0000-4000-8000-000000000001'
const NORTE = '11111111-1111-4111-8111-111111111111'
const SUR   = '22222222-2222-4222-8222-222222222222'
const REG_SUR = '33333333-3333-4333-8333-333333333333'
const INV_SUR = '44444444-4444-4444-8444-444444444444'

const USERS = {
  owner:       { id: 'u-owner', name: 'Laura',  role: 'owner',   active: true, seller_locations: [] },
  adminNorte:  { id: 'u-an',    name: 'Adm N',  role: 'admin',   active: true, seller_locations: [{ location_id: NORTE }] },
  cashierNorte:{ id: 'u-cn',    name: 'Caj N',  role: 'cashier', active: true, seller_locations: [{ location_id: NORTE }] },
  sellerNorte: { id: 'u-sn',    name: 'Ven N',  role: 'seller',  active: true, seller_locations: [{ location_id: NORTE }] },
}
const byId = Object.fromEntries(Object.values(USERS).map(u => [u.id, u]))

const TENANT = { id: TENANT_ID, name: 'Pyro', slug: 'pyro', active: true, license_start: '2026-01-01', license_end: '2099-12-31' }
const LOCATIONS = [{ id: NORTE, name: 'Norte', active: true }, { id: SUR, name: 'Sur', active: true }]

const fake = vi.hoisted(() => ({ current: null }))
// Objeto estable que delega al doble del test en curso (se recrea en beforeEach)
vi.mock('../supabaseAdmin.js', () => ({
  supabaseAdmin: {
    from: (...args) => fake.current.from(...args),
    rpc:  (...args) => fake.current.rpc(...args),
  },
}))

function resolver(q) {
  if (q.rpc) return { data: [], error: null }
  const id = filterValue(q, 'eq', 'id')
  const one = (row) => q.single
    ? { data: row ?? null, error: row ? null : { code: 'PGRST116', message: 'no rows' } }
    : { data: row ? [row] : [], error: null }

  switch (q.table) {
    case 'tenants': return one(TENANT)
    case 'sellers':
      if (q.op === 'select' && id) return one(byId[id])
      return { data: q.single ? null : [], error: null, count: 1 }
    case 'locations': {
      if (q.op !== 'select') return one({ id, name: 'x' })
      let rows = LOCATIONS
      const ins = q.filters.find(f => f[0] === 'in' && f[1] === 'id')
      if (ins) rows = rows.filter(l => ins[2].includes(l.id))
      if (id) return one(rows.find(l => l.id === id))
      return { data: rows, error: null }
    }
    case 'registers':
      if (id === REG_SUR) return one({ id: REG_SUR, name: 'Caja Sur', location_id: SUR })
      return one(null)
    case 'invoices':
      if (q.op === 'select' && id === INV_SUR) return one({ id: INV_SUR, location_id: SUR })
      return { data: q.single ? null : [], error: null, count: 0 }
    default:
      return { data: q.single ? null : [], error: null }
  }
}

let handler, signToken
beforeAll(async () => {
  process.env.JWT_SECRET = 'test-secret-matriz'
  ;({ signToken } = await import('../jwt.js'))
  handler = (await import('../../[[...path]].js')).default
})
beforeEach(() => { fake.current = createFakeSupabase(resolver) })

async function call(user, method, url, body) {
  const token = await signToken({ tenantId: TENANT_ID, sellerId: user.id, role: user.role })
  const [path, qs = ''] = url.split('?')
  const req = { method, url: path + (qs ? `?${qs}` : ''), headers: { authorization: `Bearer ${token}` },
    query: Object.fromEntries(new URLSearchParams(qs)), body }
  const res = {
    statusCode: 200, body: undefined, headersSent: false,
    setHeader() {}, status(c) { this.statusCode = c; return this },
    json(b) { this.body = b; this.headersSent = true; return this },
    end() { this.headersSent = true; return this },
  }
  await handler(req, res)
  return res
}

const DAY = 'from=2026-09-01&to=2026-09-01'
const rpcCalls = () => fake.current.calls.filter(c => c.rpc)

describe('admin Norte no ve ni toca Sur', () => {
  const a = USERS.adminNorte
  it.each([
    ['GET',  `/api/reports/daily?${DAY}&location_id=${SUR}`],
    ['GET',  `/api/reports/sellers?${DAY}&location_id=${SUR}`],
    ['GET',  `/api/reports/registers?${DAY}&location_id=${SUR}`],
    ['GET',  `/api/reports/top-products?${DAY}&location_id=${SUR}`],
    ['GET',  `/api/reports/seller-detail?${DAY}&seller_id=u-sn&location_id=${SUR}`],
    ['GET',  `/api/reports/register-detail?${DAY}&register_id=${REG_SUR}`],
    ['GET',  `/api/invoices/history?${DAY}&location_id=${SUR}`],
    ['GET',  `/api/invoices/pending?location_id=${SUR}`],
    ['GET',  `/api/closures?${DAY}&location_id=${SUR}`],
    ['GET',  `/api/sellers?location_id=${SUR}`],
    ['POST', `/api/invoices/1234/pay`, { location_id: SUR, pay_method: 'cash' }],
    ['POST', `/api/invoices/1234/cancel`, { location_id: SUR }],
    ['POST', `/api/invoices/${INV_SUR}/refund`, { reason: 'x' }],
    ['PUT',  `/api/registers/${REG_SUR}`, { name: 'hack' }],
    ['POST', `/api/registers`, { name: 'Caja 3', location_id: SUR }],
    ['PUT',  `/api/locations/${SUR}`, { printer_config: {} }],
  ])('%s %s → 403', async (method, url, body) => {
    const res = await call(a, method, url, body)
    expect(res.statusCode).toBe(403)
  })

  it('reporte sin location_id se fuerza a Norte (nunca consolidado)', async () => {
    const res = await call(a, 'GET', `/api/reports/daily?${DAY}`)
    expect(res.statusCode).toBe(200)
    const summary = rpcCalls().find(c => c.rpc === 'report_range_summary')
    expect(summary.params.p_location_id).toBe(NORTE)
    expect(rpcCalls().some(c => c.rpc === 'report_range_by_location')).toBe(false)
  })

  it('no accede al comparativo de puntos', async () => {
    expect((await call(a, 'GET', `/api/reports/locations?${DAY}`)).statusCode).toBe(403)
  })

  it('GET /locations solo devuelve Norte', async () => {
    const res = await call(a, 'GET', '/api/locations')
    expect(res.statusCode).toBe(200)
    expect(res.body.map(l => l.id)).toEqual([NORTE])
  })

  it('no crea superadmin ni admin', async () => {
    for (const role of ['owner', 'admin']) {
      const res = await call(a, 'POST', '/api/sellers', { name: 'X', role, username: 'nuevo.x', password: '1234567890', location_ids: [NORTE] })
      expect(res.statusCode).toBe(403)
    }
  })

  it('no edita catálogo ni puntos de venta', async () => {
    expect((await call(a, 'PUT', '/api/products/p1', { name: 'x' })).statusCode).toBe(403)
    expect((await call(a, 'POST', '/api/products/bulk', { products: [] })).statusCode).toBe(403)
    expect((await call(a, 'POST', '/api/locations', { name: 'Centro' })).statusCode).toBe(403)
    expect((await call(a, 'PUT', `/api/locations/${NORTE}`, { name: 'Renombrado' })).statusCode).toBe(403)
  })

  it('sí configura la impresora de su punto', async () => {
    expect((await call(a, 'PUT', `/api/locations/${NORTE}`, { printer_config: { paper_width: '58mm' } })).statusCode).toBe(200)
  })
})

describe('vendedor y cajero', () => {
  it('vendedor no cobra, no cancela, no ve reportes ni historial', async () => {
    const s = USERS.sellerNorte
    expect((await call(s, 'POST', '/api/invoices/1234/pay', { location_id: NORTE, pay_method: 'cash' })).statusCode).toBe(403)
    expect((await call(s, 'POST', '/api/invoices/1234/cancel', { location_id: NORTE })).statusCode).toBe(403)
    expect((await call(s, 'GET', `/api/reports/daily?${DAY}`)).statusCode).toBe(403)
    expect((await call(s, 'GET', `/api/invoices/history?${DAY}`)).statusCode).toBe(403)
    expect((await call(s, 'GET', '/api/sellers')).statusCode).toBe(403)
  })

  it('cajero no ve reportes', async () => {
    expect((await call(USERS.cashierNorte, 'GET', `/api/reports/daily?${DAY}`)).statusCode).toBe(403)
  })
})

describe('superadministrador', () => {
  const o = USERS.owner
  it('ve consolidado y comparativo', async () => {
    const res = await call(o, 'GET', `/api/reports/daily?${DAY}`)
    expect(res.statusCode).toBe(200)
    expect(rpcCalls().find(c => c.rpc === 'report_range_summary').params.p_location_id).toBeNull()
    expect(rpcCalls().some(c => c.rpc === 'report_range_by_location')).toBe(true)
    expect((await call(o, 'GET', `/api/reports/locations?${DAY}`)).statusCode).toBe(200)
  })

  it('consulta Sur', async () => {
    expect((await call(o, 'GET', `/api/reports/daily?${DAY}&location_id=${SUR}`)).statusCode).toBe(200)
  })

  it('no accede a puntos de otra empresa', async () => {
    const ajena = '99999999-9999-4999-8999-999999999999'
    expect((await call(o, 'GET', `/api/reports/daily?${DAY}&location_id=${ajena}`)).statusCode).toBe(403)
  })
})
```

- [ ] **Step 3: Correr**

Run: `npx vitest run api/_lib/__tests__/scopeMatrix.test.js`
Expected: PASS. Si alguna fila da 400/404/500 en lugar de 403, revisar que en ese endpoint el chequeo de rol/alcance ocurra **antes** de validar el body o consultar datos (Task 5) — no ajustar el test para aceptar otro código.

Run: `npm test`
Expected: PASS completo.

- [ ] **Step 4: Commit**

```bash
git add api/_lib/__tests__/fakeSupabase.js api/_lib/__tests__/scopeMatrix.test.js
git commit -m "test(api): matriz de acceso por rol y punto de venta contra el router"
```

---

### Task 10: Manual, verificación visual y checklist de despliegue

**Files:**
- Create: `docs/manual-usuarios.md`

- [ ] **Step 1: Escribir el manual**

`docs/manual-usuarios.md`:

```markdown
# PyroVenta — Manual de usuarios y roles

## Los cuatro roles

| Rol | Qué hace | Cómo entra |
|---|---|---|
| **Superadministrador** | Ve y administra todos los puntos, el consolidado y la comparativa. Crea administradores y otros superadministradores. Único que edita productos, precios y puntos de venta. | Pantalla de inicio → **Ingreso administrativo** → usuario y contraseña |
| **Administrador** | Ve reportes, historial y cierres **solo de su punto**. Crea vendedores y cajeros de su punto, crea cajas y configura la impresora. Puede vender y cobrar. | **Ingreso administrativo** → usuario y contraseña |
| **Cajero** | Cobra, registra el método de pago, hace devoluciones y cierra caja. También puede vender. | Punto de venta → PIN de 4 dígitos |
| **Vendedor** | Arma el carrito y genera el código de la venta. No cobra. | Punto de venta → PIN de 4 dígitos |

## Crear el administrador de un punto (superadministrador)
1. Admin → **Usuarios** → **+ Nuevo**.
2. Nombre, rol **Administrador**.
3. Usuario (ej. `admin.norte`) y contraseña de mínimo 10 caracteres.
4. Marcar el punto que administra (solo uno) → **Guardar**.
5. Entregarle usuario y contraseña en persona.

## Crear un cajero o vendedor (administrador o superadministrador)
1. Admin → **Usuarios** → **+ Nuevo**.
2. Nombre, rol **Cajero** o **Vendedor**, PIN de 4 dígitos.
3. El administrador de punto no elige punto: queda en el suyo. El superadministrador marca en cuál(es) trabaja.
4. **Guardar**. La persona entra eligiendo su punto y escribiendo el PIN.

## Crear las cajas de un punto
Admin → **Cajas** → **+ Nueva caja** → nombre (ej. "Caja 2"). Norte: Caja 1. Sur: Caja 1 y Caja 2.

## Cambiar PIN o contraseña
Admin → Usuarios → **Editar** → escribir el nuevo PIN o contraseña. Si se deja vacío, no cambia. El PIN ya no se muestra en la lista por seguridad.

## Desactivar a alguien que ya no trabaja
Admin → Usuarios → **Desactivar**. No se borra su historial de ventas.

## Reglas que el sistema no deja romper
- Un administrador no puede crear superadministradores ni administradores, ni verlos en la lista.
- Nadie puede cambiarse su propio rol, sus puntos ni desactivarse.
- Siempre debe quedar al menos un superadministrador activo.
- Un administrador no puede ver ventas, cierres ni usuarios del otro punto, aunque cambie la dirección de la página.

## Superadministrador: trabajar en un punto
En la barra superior, el selector de punto muestra **Todos los puntos** (solo administración) o el punto elegido. Para vender o cobrar, elegir un punto: aparecen los botones **Vender** y **Caja**.
```

- [ ] **Step 2: Verificación visual (obligatoria por preferencias globales)**

Levantar el entorno local (`vercel dev` o el mecanismo usado por el proyecto; ver skill `run`) con una BD de pruebas que tenga la migración del Task 1, un owner, un admin Norte, un cajero Norte y un vendedor Norte.

Usar la skill `visual-qa` sobre: login (paso punto → "Ingreso administrativo" → formulario → selección de punto del owner), Topbar con selector de punto (desktop y 400px), Admin → Resumen como owner (con comparativo) y como admin Norte (sin selector ni comparativo), Admin → Usuarios con el formulario en los cuatro roles, Admin → Puntos como admin (campos deshabilitados). Revisar foco de teclado en los formularios nuevos y que nada desborde a 400px. Corregir lo que salga antes de seguir.

- [ ] **Step 3: Checklist E2E manual (misma BD de pruebas)**

1. Admin de PIN antiguo ya no entra con PIN.
2. Owner entra con usuario/contraseña, ve "Todos los puntos", el comparativo y la pestaña Productos.
3. Owner crea `admin.norte` con punto Norte; intentar asignarle Norte y Sur → error "exactamente un punto".
4. `admin.norte` entra: resumen solo de Norte, sin selector de punto, sin comparativo, sin pestañas Productos; Puntos muestra solo Norte con nombre deshabilitado.
5. `admin.norte` en Usuarios: rol solo ofrece Vendedor/Cajero; no ve al owner.
6. `admin.norte` con DevTools llama `GET /api/reports/daily?location_id=<SUR>` → 403.
7. Cajero Norte entra con PIN, ve Vender y Caja, cobra una venta.
8. Vendedor Norte con su token llama `POST /api/invoices/<code>/pay` → 403.
9. Owner intenta desactivarse → botón no aparece; por API → 403. Con un solo owner, intentar degradarlo desde otro owner → 409.
10. 5 contraseñas malas seguidas en el ingreso administrativo → bloqueo de 15 minutos.

- [ ] **Step 4: Commit**

```bash
git add docs/manual-usuarios.md
git commit -m "docs: manual de usuarios, roles y permisos"
```

- [ ] **Step 5: Orden de despliegue (lo ejecuta el usuario; NO hacer push sin confirmación)**

1. Ejecutar en Supabase, en este orden y si no se han corrido: `2026-07-21_caja_v2.sql`, `2026-08-03_invoice_idempotency.sql`, `2026-08-03_transfer_provider.sql`, `2026-09-12_roles_owner.sql`.
2. `git push` → deploy en Vercel.
3. Desde `/super`, en la empresa, crear los superadministradores de Laura y Julián (botón de administrador de la empresa, ahora con usuario/contraseña).
4. Laura entra por "Ingreso administrativo", crea `admin.norte` y `admin.sur`, y reasigna/crea cajeros y vendedores por punto.
5. Crear las cajas: Norte → Caja 1; Sur → Caja 1 y Caja 2.

**Aviso:** entre el paso 1 y el 4 los admins de PIN antiguos no pueden entrar (vendedores y cajeros sí). Hacerlo fuera del horario de venta.
```

---

## Self-review (hecho al escribir el plan)

- **Cobertura del spec (fase 1):** §3.1 roles → Task 1-2; §3.2 datos → Task 1; §3.3 candado → Task 2, 4, 5, 9; §3.4 superadmin oculto (reglas 1-6) → Task 3 (`userRules`), Task 5 (`sellersGet` filtra owners/admins), Task 8 (selector de rol); seguridad reforzada (10 caracteres, bloqueo, 8h) → Task 3-4; §3.5 login → Task 4, 7; §4 comparativo → Task 5 (`view_consolidated`), Task 8; §6.1 matriz → Task 2; §6.2 candados → Task 5; §6.4 manual → Task 10; D5 catálogo → Task 5, 8; D6 creación por owner → Task 3, 6; D8 admin vende/cobra → Task 2, 7. Bitácora (§9) y "Mis ventas" (§6.3) quedan en fase 2 según §10 del spec.
- **Desviación declarada:** firmas SQL `p_location_ids` (ver Global Constraints).
- **Consistencia de nombres:** `requireCan`, `scopedLocation`, `denyOutOfScope`, `loadScopedRegister`, `checkUserChange`, `buildScope`, `resolveLocation`, `locationInScope`, `ROLE_LABELS`, `assignableRoles` usados igual en todas las tareas.
