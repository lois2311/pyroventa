# PyroVenta — Roles, separación por punto de venta y cajas v3

**Fecha:** 2026-09-12
**Estado:** Borrador v2 — decisiones del negocio incorporadas, pendiente aprobación final
**Base:** master en `b46f912`
**Origen:** documento "REQUERIMIENTOS PARA PYROVENTA" (REQ 001 a 007)

---

## 0. Cómo funciona hoy (lo que condiciona todo lo demás)

| Tema | Estado actual | Dónde |
|---|---|---|
| Usuarios | Tabla `sellers` con rol `seller` / `cashier` / `admin`. Todos entran con **PIN de 4 dígitos**. El PIN está en texto plano y el admin lo ve en la lista. | `supabase/schema.sql`, `AdminPage.jsx:332` |
| Admin y puntos | Un `admin` **entra a cualquier punto de venta** aunque no esté asignado. No existe "admin de un punto". | `api/[[...path]].js:162` |
| Filtro por punto | `location_id` llega como parámetro de la URL y el servidor lo acepta tal cual. Si no se manda, devuelve **todos los puntos**. | reportes, historial, cierres |
| Permisos en reportes | `/reports/*` solo piden **estar logueado**, no ser admin. Un vendedor con su token puede consultar las ventas de toda la empresa. | `api/[[...path]].js:1037-1324` |
| Cobro | La UI solo muestra el cobro a cajero/admin, pero `POST /invoices/:code/pay` y `/cancel` **no validan el rol**. | `api/[[...path]].js:896, 976` |
| Cajas | Tabla `registers` por punto (ya se pueden crear N cajas). El cajero **elige la caja libremente** al entrar. | `LoginPage.jsx`, `CajaPage.jsx` |
| Cuadre | `register_closures`: **un cierre por caja por día**; la diferencia solo se calcula en efectivo. No hay apertura, base ni movimientos. | `closuresCreate` |
| Transferencias | Ya se exige Nequi / Daviplata / Bancolombia al cobrar y hay desglose en reportes (`52a162f`). | `PaymentMethods.jsx`, `transferBreakdown` |
| Precios | El precio lo pone **siempre el servidor** desde `presentations` (`bcc593a`). Nadie puede cambiar un precio en una venta; solo existe el descuento al cobrar. | `api/_lib/invoiceItems.js` |
| Súper admin de plataforma | `super_admins` es el **dueño de PyroVenta** (varias empresas), no un rol dentro de la empresa. | `SuperDashboard.jsx` |
| Acceso a datos | Todo pasa por la API con la *service key* de Supabase (salta RLS). El navegador no toca tablas. | `api/_lib/supabaseAdmin.js` |

**Pendientes previos:**
- `supabase/migrations/2026-08-03_transfer_provider.sql` tiene basura al final (`sss`) en la copia local sin commitear — revertir antes de ejecutarla.
- Confirmar en Supabase las migraciones `caja_v2`, `invoice_idempotency` y `transfer_provider`.

---

## 1. Decisiones del negocio (2026-09-12)

| # | Decisión |
|---|---|
| D1 | **Solo dos niveles administrativos:** Superadministrador (todos los puntos de la empresa) y Administrador (solo su punto). **Sin** constructor de roles ni interruptores de permisos por usuario. |
| D2 | Vendedor y Cajero **siguen como hoy** (PIN, atados a su punto), por debajo del administrador. |
| D3 | El **cajero también puede vender** (una persona vende y cobra cuando haga falta). |
| D4 | **Modificar precio** en una venta: solo Administrador y Superadministrador. Motivo **obligatorio**. |
| D5 | **Catálogo y precios base:** solo Superadministrador. |
| D6 | **El Superadministrador crea** administradores y otros superadministradores. El Administrador solo crea vendedores y cajeros de su punto. |
| D7 | **Una sola cuenta bancaria:** opciones fijas Cuenta bancaria / Nequi / Daviplata. |
| D8 | Administrador y Superadministrador **pueden vender y cobrar** en el POS (el admin solo en su punto). |
| D9 | Julián queda con **una sola cuenta de Superadministrador**; como tal puede cambiar precios (resuelve el conflicto REQ 006 vs. 007). |

Valores por defecto adoptados (sin pregunta al negocio, cambiables):
- Segundo factor (TOTP) para superadmin: **fase posterior**; ahora contraseña fuerte + bloqueo + bitácora.
- El PIN deja de mostrarse en la lista; se reemplaza por "Restablecer PIN".
- Un vendedor/cajero asignado a ambos puntos solo lo puede editar un superadmin.

---

## 2. Veredicto por requerimiento

| REQ | Tema | Veredicto | Cómo queda |
|---|---|---|---|
| 001 | Usuario independiente por punto | ✅ Viable | Admin con usuario/contraseña propio y un punto. Candado en la API y en SQL (§3.3). |
| 002 | Quitar comparativo a admins | ✅ Viable, pequeño | Comparativo y consolidado solo para superadmin (§4). |
| 003 | Pagos por cuenta | 🟡 ~80 % hecho | Renombrar a "Cuenta bancaria" y cuadre con las 5 líneas (§7). |
| 004 | Cajas por punto | ✅ Viable, el más grande | Turnos con apertura, movimientos, cierre y cajero asignado a caja (§5). |
| 005 | Roles y permisos | ✅ Viable, **simplificado** | Cuatro roles fijos con matriz fija + manual (§6). Sin editor de permisos (decisión D1). |
| 006 | Modificar precio | ✅ Viable, **simplificado** | Solo admin/superadmin, con motivo y trazabilidad (§8). |
| 007 | Superadmin oculto | ✅ Viable | Reglas validadas en servidor (§3.4). |

No se hará tal cual: **RLS literal en Postgres** (la app no lee tablas desde el navegador). Se reemplaza por candado central en la API + funciones SQL que exigen el punto; manipular URL o token devuelve 403.

---

## 3. REQ 001 + 007 — Usuarios y alcance por punto

### 3.1 Roles

| Rol (`sellers.role`) | En pantalla | Alcance | Entra con |
|---|---|---|---|
| `owner` **(nuevo)** | Superadministrador | Todos los puntos de la empresa + consolidado | Usuario + contraseña |
| `admin` | Administrador | **Solo** su punto (`seller_locations`) | Usuario + contraseña |
| `cashier` | Cajero | Su punto; su caja si tiene asignada | PIN |
| `seller` | Vendedor | Su punto | PIN |

- `owner` es de la empresa; el dueño de la plataforma sigue en `/super` (`super_admins`).
- Se elimina el fallback que deja al admin entrar a cualquier punto (`authLogin`, línea 162).
- Un `admin` tiene exactamente **un** punto asignado.

### 3.2 Cambios de datos

```sql
ALTER TABLE sellers DROP CONSTRAINT sellers_role_check;
ALTER TABLE sellers ADD CONSTRAINT sellers_role_check
  CHECK (role IN ('seller', 'cashier', 'admin', 'owner'));

ALTER TABLE sellers ADD COLUMN username      TEXT;   -- solo admin/owner
ALTER TABLE sellers ADD COLUMN password_hash TEXT;   -- bcrypt, solo admin/owner
ALTER TABLE sellers ADD COLUMN register_id   UUID REFERENCES registers(id); -- caja fija del cajero (§5.3)
ALTER TABLE sellers ALTER COLUMN pin DROP NOT NULL;  -- admin/owner no usan PIN

CREATE UNIQUE INDEX sellers_tenant_username ON sellers(tenant_id, lower(username))
  WHERE username IS NOT NULL;

ALTER TABLE sellers ADD CONSTRAINT sellers_credentials_by_role CHECK (
  (role IN ('admin','owner') AND username IS NOT NULL AND password_hash IS NOT NULL)
  OR (role IN ('seller','cashier') AND pin IS NOT NULL)
);
```

Migración de datos: el admin compartido actual pasa a `owner` (o se desactiva); se crean los owners de Laura y Julián y un admin por punto (Norte, Sur) con usuario/contraseña.

Crear un `owner` desde `/super` (panel de plataforma) para el arranque de cada empresa: se reemplaza `superTenantAdminCreate` para que cree un owner con usuario/contraseña.

### 3.3 Candado de alcance en la API

`requireAuth` ya lee el usuario en cada petición; se amplía con sus puntos:

```js
auth.scope = role === 'owner'
  ? { all: true }
  : { all: false, locationIds: [...seller_locations] }
```

Función única `resolveLocation(auth, requested)` usada por **todos** los endpoints:

| Caso | Resultado |
|---|---|
| owner sin `location_id` | `null` = consolidado |
| owner con `location_id` de su empresa | ese punto |
| no-owner con `location_id` suyo | ese punto |
| no-owner con `location_id` ajeno | **403** |
| no-owner sin `location_id` | su punto (si tiene varios, 400) |

Para quien no es owner **nunca** devuelve `null`. Endpoints:

- **Reportes** `/reports/*`: exigen `admin` u `owner` + `resolveLocation`. `/reports/locations` y `by_location` → **solo owner**.
- **Facturas**: `history`, `pending`, `GET /:code`, `pay`, `cancel`, `edit` con `resolveLocation`; `refund` (por id) valida que la factura sea de su alcance.
- **Cierres / cajas / turnos**: `resolveLocation`; caja de otro punto → 403.
- **Usuarios** `/sellers`: el admin solo ve/edita vendedores y cajeros de su punto.
- **Puntos** `/locations`: `GET` filtra por alcance; crear/editar/borrar → solo owner.
- **Productos, categorías, carga masiva, fotos**: escritura → **solo owner** (D5). Lectura igual que hoy.
- **Login**: `locationId` del token validado contra `seller_locations` para todo rol que no sea owner.

Defensa en SQL: `report_range_*` reciben `p_location_ids UUID[]` obligatorio salvo owner, para que un olvido futuro no devuelva "todo" por omisión.

Tests: matriz rol × endpoint (hoy el router no tiene tests) que verifique 403 de admin Norte en todo lo de Sur, incluso manipulando `location_id`.

### 3.4 Superadministrador oculto (REQ 007) — reglas de servidor

1. Solo un `owner` (o el dueño de plataforma) crea, edita o desactiva `owner` y `admin`.
2. Un `admin` que envía `role: 'owner'` o `role: 'admin'` en `/sellers` → 403. Solo crea `seller` y `cashier` de su punto.
3. Nadie cambia **su propio** rol ni sus puntos.
4. Un admin no puede ver, editar ni desactivar a otro admin ni a un owner. `GET /sellers` no los devuelve a un admin.
5. El selector de rol que ve el admin tiene solo Vendedor y Cajero. El owner ve los cuatro.
6. Siempre queda **al menos un owner activo**: no se puede desactivar ni degradar al último.

Seguridad reforzada del owner (y del admin):
- Contraseña mínima de 10 caracteres, bloqueo por intentos (reusa `login_attempts`).
- Sesión administrativa más corta (p. ej. 8 h).
- Cada cambio de usuario, rol o punto queda en la bitácora (§9).

### 3.5 Login

- **POS** (vendedor, cajero): igual que hoy — empresa → punto → PIN.
- **Administrativo** (admin, owner): enlace "Ingreso administrativo" → usuario + contraseña. El admin cae en su punto; el owner elige "Todos los puntos" o uno. Desde ahí pueden ir al panel, a vender o a caja (D8).

---

## 4. REQ 002 — Comparativo solo para el Superadministrador

- `LocationComparison` y cualquier vista "Todos los puntos" solo si `role === 'owner'`.
- El admin no ve selector de punto: está fijo en el suyo.
- La garantía real es §3.3; ocultar el componente es cosmético.

---

## 5. REQ 004 — Cajas por punto con turnos

### 5.1 Se conserva
Crear/editar/desactivar cajas por punto (`registers`). Norte con "Caja 1" y Sur con "Caja 1" y "Caja 2" es configuración que hace el owner o el admin de cada punto.

### 5.2 Turno de caja (nuevo)

Se pasa de "cierre por caja por día" a **turno**: apertura → ventas → movimientos → cierre.

```sql
CREATE TABLE register_sessions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  location_id   UUID NOT NULL REFERENCES locations(id),
  register_id   UUID NOT NULL REFERENCES registers(id),
  opened_by     UUID NOT NULL REFERENCES sellers(id),
  opened_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  opening_cash  NUMERIC(12,2) NOT NULL DEFAULT 0,   -- base
  closed_by     UUID REFERENCES sellers(id),
  closed_at     TIMESTAMPTZ,
  expected      JSONB,   -- {cash, bank, nequi, daviplata, card}
  declared      JSONB,   -- lo contado/confirmado por medio
  difference    JSONB,   -- declarado - esperado por medio
  notes         TEXT,
  status        TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed'))
);
CREATE UNIQUE INDEX register_sessions_one_open ON register_sessions(register_id) WHERE status = 'open';

CREATE TABLE cash_movements (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  session_id  UUID NOT NULL REFERENCES register_sessions(id),
  type        TEXT NOT NULL CHECK (type IN ('in','out')),  -- ingreso / retiro o gasto
  amount      NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  reason      TEXT NOT NULL,
  created_by  UUID NOT NULL REFERENCES sellers(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE invoices ADD COLUMN session_id UUID REFERENCES register_sessions(id);
```

Reglas:
- **No se cobra sin turno abierto.** La API toma `register_id` y `session_id` de la sesión abierta, no del body.
- Efectivo esperado = base + ventas en efectivo + ingresos − retiros − devoluciones en efectivo del turno.
- El cierre calcula esperado, declarado y diferencia por cada medio (§7).
- Quién hizo qué: `opened_by`, `closed_by`, `cashier_id` en la factura, `created_by` en movimientos.
- Cerrar un turno ajeno (cajero que se fue sin cerrar) → admin del punto u owner, con nota obligatoria.
- `register_closures` queda como histórico de solo lectura.

### 5.3 Cajero asignado a caja
- `sellers.register_id` opcional. Con caja asignada entra directo y no la cambia; sin asignación elige entre las cajas **de su punto**.
- La API valida que la caja sea del punto del token y coincida con la asignación.

### 5.4 Pantallas
- Caja: "Caja cerrada → Abrir turno (base)", botón "Ingreso / Retiro", cierre con conteo por medio.
- Admin → Cajas: turnos por caja con diferencias resaltadas y detalle de movimientos.

---

## 6. REQ 005 — Roles fijos (simplificado por D1)

### 6.1 Matriz fija

| Acción | Vendedor | Cajero | Admin (su punto) | Superadmin |
|---|---|---|---|---|
| Crear ventas / carrito / consultar productos | ✅ | ✅ (D3) | ✅ | ✅ |
| Ver sus propias ventas | ✅ | ✅ | ✅ | ✅ |
| Cobrar y registrar método de pago | ❌ | ✅ | ✅ | ✅ |
| Descuento al cobrar | ❌ | ✅ | ✅ | ✅ |
| Devoluciones | ❌ | ✅ | ✅ | ✅ |
| Abrir turno, movimientos, cerrar caja | ❌ | ✅ | ✅ | ✅ |
| **Modificar precio en una venta** | ❌ | ❌ | ✅ | ✅ |
| Reportes y cuadres | ❌ | ❌ | ✅ | ✅ (todos + consolidado) |
| Crear vendedores y cajeros | ❌ | ❌ | ✅ | ✅ |
| Asignar cajero a caja / crear cajas | ❌ | ❌ | ✅ | ✅ |
| Crear administradores y superadmins | ❌ | ❌ | ❌ | ✅ |
| Catálogo y precios base | ❌ | ❌ | ❌ | ✅ |
| Crear/editar puntos de venta | ❌ | ❌ | ❌ | ✅ |
| Comparativo entre puntos | ❌ | ❌ | ❌ | ✅ |

Implementación: un mapa `ROLE_ACTIONS` en `api/_lib/roles.js` y un helper `can(auth, 'charge')` que reemplaza los `['cashier','admin'].includes(role)` repartidos en el router. El front usa el mismo mapa para mostrar u ocultar.

### 6.2 Candados que faltan hoy
- `pay`, `cancel`, `edit` exigen `charge` → un vendedor que llame la API recibe 403.
- Ruta `/vender` admite `cashier` (D3).

### 6.3 "Mis ventas"
Nuevo `GET /invoices/mine?from&to` (filtra por `seller_id = auth.seller.id` en servidor) y pestaña "Mis ventas" en `/vender`.

### 6.4 Enseñar a administrarlo
- Manual `docs/manual-usuarios.md` con capturas: crear un admin de punto, crear un cajero y asignarlo a punto y caja, desactivar un usuario, restablecer PIN o contraseña, qué ve cada rol.
- Ayuda de una línea por rol en el formulario de usuario.
- Sesión guiada con Laura y Julián.

---

## 7. REQ 003 — Cuadre por cuenta

Ya existe `invoices.transfer_provider`, obligatorio en la UI, con desglose en reportes.

Falta:
1. **Cuenta bancaria (D7).** El valor `bancolombia` pasa a `bank` (migración de datos + CHECK) y en pantalla se lee "Cuenta bancaria".
2. **Cuadre por medio:** el cierre de turno muestra Efectivo, Cuenta bancaria, Nequi, Daviplata y Datáfono — esperado, declarado y diferencia.
3. **Reportes y Excel** con las cinco columnas; "Transferencias" queda como subtotal.
4. **API estricta:** tras un periodo de gracia, transferencia sin cuenta → 400 en servidor.
5. Ejecutar `2026-08-03_transfer_provider.sql` ya limpia (o fusionarla con esta migración).

---

## 8. REQ 006 — Modificar precio (simplificado por D4)

### 8.1 Comportamiento
- Admin y superadmin ven un lápiz en cada línea del carrito (en `/vender`) y en la edición de factura pendiente (en `/caja`) para cambiar el **precio unitario de esa venta**. No cambia el catálogo.
- Motivo **obligatorio** (D4).
- Vendedor y cajero no ven el lápiz, y la API rechaza cualquier precio distinto al del catálogo (se mantiene el candado de `bcc593a`).

### 8.2 Servidor
- El item acepta `price_override` y `price_reason`. `buildInvoiceItems` los aplica solo si `can(auth, 'edit_price')`; si no, 403.
- La línea guarda `original_price` y `price` (cobrado) en el JSON para que reportes y cuadre sigan exactos.
- Precio > 0; motivo no vacío.
- Si un cajero edita después una factura con precios modificados, puede cambiar cantidades pero **no** esos precios; las líneas conservan el override.

### 8.3 Trazabilidad

```sql
CREATE TABLE price_overrides (
  id              BIGSERIAL PRIMARY KEY,
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  location_id     UUID NOT NULL REFERENCES locations(id),
  invoice_id      UUID NOT NULL REFERENCES invoices(id),
  invoice_code    CHAR(4) NOT NULL,
  presentation_id UUID,
  product_name    TEXT,
  original_price  NUMERIC(12,2) NOT NULL,
  new_price       NUMERIC(12,2) NOT NULL,
  qty             INTEGER NOT NULL,
  changed_by      UUID NOT NULL REFERENCES sellers(id),
  changed_by_name TEXT,
  reason          TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

El código de factura de 4 dígitos **se recicla**, por eso se guarda también `invoice_id` y la fecha.

Reporte "Cambios de precio" (owner: todos los puntos; admin: el suyo), filtrable por usuario y rango, exportable a Excel.

---

## 9. Bitácora de auditoría (transversal)

```sql
CREATE TABLE audit_log (
  id          BIGSERIAL PRIMARY KEY,
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  location_id UUID REFERENCES locations(id),
  actor_id    UUID REFERENCES sellers(id),
  actor_name  TEXT,
  action      TEXT NOT NULL,   -- user.create, user.role_change, user.deactivate, session.open, session.close, ...
  entity      TEXT,
  entity_id   UUID,
  before      JSONB,
  after       JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Solo inserción desde la API. Visible para owner (todo) y admin (su punto, sin eventos sobre owners/admins).

---

## 10. Fases

| Fase | Contenido | Por qué en este orden | Tamaño |
|---|---|---|---|
| **0** | Limpiar `transfer_provider.sql`; confirmar las 3 migraciones pendientes | Base de todo lo demás | S |
| **1 — Separación y seguridad** | REQ 001, 002, 007; matriz fija §6 con `can()`; candados §6.2; catálogo solo owner; tests de alcance; manual | Hoy hay fuga real: cualquier token lee reportes de toda la empresa | L |
| **2 — Precio y trazabilidad** | REQ 006, bitácora §9, "Mis ventas" | Necesita roles de fase 1 | M |
| **3 — Caja v3** | REQ 004 (turnos, movimientos, cajero↔caja) + REQ 003 (cuenta bancaria y cuadre por medio) | Cambio operativo más grande; hacerlo con roles estables y **fuera de temporada alta** | L |

Cada fase: migración no destructiva, fallback si la migración no ha corrido (patrón actual) y checklist de prueba manual.

## 11. Fuera de alcance
- Constructor de roles e interruptores de permisos por usuario (D1).
- Precios distintos por punto de venta.
- Inventario / stock.
- RLS de Postgres con JWT propio.
- Segundo factor (TOTP) — fase posterior.
- Facturación electrónica DIAN.
