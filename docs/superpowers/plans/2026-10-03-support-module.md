# Módulo de Soporte y Mesa de Ayuda — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar un canal accesible y guiado de soporte para clientes (tiendas, cajeros, administradores) y una Mesa de Ayuda centralizada en tiempo real para el equipo de plataforma (SuperAdmin / Flightdev).

**Architecture:** Se creará la tabla `support_tickets` en Supabase con RLS y código secuencial (`VND-1001`). En el backend serverless (`api/[[...path]].js`) se expondrán endpoints para creación de tickets y gestión administrativa. En el frontend, se agregará un capturador de telemetría, un modal guiado en 3 pasos con auto-resolución rápida y enlace a WhatsApp, puntos de acceso en `Topbar` y alertas de error, y una pestaña de Mesa de Soporte con actualización en tiempo real en `SuperDashboard`.

**Tech Stack:** React 18, Vite, Vitest, Tailwind CSS v3, Lucide React, Supabase (PostgreSQL + Realtime), Vercel Serverless Functions.

**Spec:** [`docs/superpowers/specs/2026-10-03-support-module-design.md`](file:///c:/FrontProyects/pos.pirotecnia/docs/superpowers/specs/2026-10-03-support-module-design.md)

## Global Constraints

- Seguir la arquitectura serverless consolidada en `api/[[...path]].js` (límite de rutas de Vercel).
- El backend corre con `service_role` (bypasea RLS) y el frontend usa `anon` key exclusivamente para suscripciones Realtime.
- Diseño visual alineado a la guía de marca VENDRA: tema oscuro (`bg-surface-600`), acento Volt `#B4E854` (`brand-500`), tipografía JetBrains Mono para códigos de tickets.
- Mantener la regla de rendimiento y simplicidad (Ponytail): cero librerías externas pesadas de chat; interacción ágil y directa vía WhatsApp y Realtime.
- Soporte para atajo de teclado accesible (`F12` o `?`).

## Review Focus

1. **Venta en curso no debe perderse:** Abrir el modal de soporte desde la caja o venta nunca debe reiniciar el carrito (`useCartStore`) ni interferir con la transacción activa.
2. **Resiliencia sin conexión:** Si el cliente reporta sin internet (`navigator.onLine === false`), el sistema debe mostrar el número de WhatsApp directo con el mensaje precargado en el portapapeles sin colapsar.
3. **Validación de teléfono/contacto:** El campo de teléfono debe admitir formatos comunes colombianos (10 dígitos móviles) y normalizarse para el enlace de WhatsApp (`https://wa.me/57...`).
4. **Segregación multi-tenant:** Un tenant o cajero no puede listar tickets de otras empresas; solo el SuperAdmin (`pv_super_token`) puede consultar tickets globales.
5. **No saturar la UI con modales encimados:** Si ya hay un diálogo abierto (ej: ConfirmDialog o Cobro), el modal de soporte debe montarse limpiamente con `z-index` adecuado (z-50) sin romper el foco de accesibilidad.

---

### Task 1: Esquema de Base de Datos y Migración SQL

**Files:**
- Create: `supabase/migrations/2026-10-03_support_tickets.sql`
- Test: `src/lib/__tests__/supportMigration.test.js`

**Interfaces:**
- Produces: Tabla `support_tickets` con secuencia `support_ticket_seq` y función `generate_ticket_code()`.

- [ ] **Step 1: Escribir el test que valida la sintaxis y columnas esperadas de la migración**

```javascript
// src/lib/__tests__/supportMigration.test.js
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

describe('Migración support_tickets', () => {
  it('contiene la definición de tabla con columnas requeridas y RLS', () => {
    const migrationPath = path.resolve(__dirname, '../../../supabase/migrations/2026-10-03_support_tickets.sql')
    expect(fs.existsSync(migrationPath)).toBe(true)
    const sql = fs.readFileSync(migrationPath, 'utf8')
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS support_tickets')
    expect(sql).toContain('ticket_code')
    expect(sql).toContain('tenant_id')
    expect(sql).toContain('technical_context')
    expect(sql).toContain('ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY')
  })
})
```

- [ ] **Step 2: Ejecutar el test para verificar que falla**

Run: `npm test src/lib/__tests__/supportMigration.test.js`  
Expected: FAIL (archivo no existe)

- [ ] **Step 3: Crear el archivo de migración SQL**

```sql
-- supabase/migrations/2026-10-03_support_tickets.sql
CREATE SEQUENCE IF NOT EXISTS support_ticket_seq START WITH 1001;

CREATE TABLE IF NOT EXISTS support_tickets (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_code       TEXT NOT NULL UNIQUE,
  tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  tenant_name       TEXT NOT NULL,
  location_id       UUID REFERENCES locations(id) ON DELETE SET NULL,
  location_name     TEXT,
  register_id       UUID REFERENCES registers(id) ON DELETE SET NULL,
  register_name     TEXT,
  reported_by_id    UUID REFERENCES sellers(id) ON DELETE SET NULL,
  reported_by_name  TEXT NOT NULL,
  reported_by_role  TEXT,
  contact_phone     TEXT NOT NULL,
  category          TEXT NOT NULL CHECK (category IN ('printer', 'payment', 'inventory', 'auth', 'system', 'other')),
  subcategory       TEXT,
  description       TEXT,
  priority          TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  status            TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
  technical_context JSONB NOT NULL DEFAULT '{}',
  assigned_to       TEXT,
  resolution_notes  TEXT,
  resolved_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION generate_ticket_code()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.ticket_code IS NULL OR NEW.ticket_code = '' THEN
    NEW.ticket_code := 'VND-' || nextval('support_ticket_seq')::TEXT;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_support_ticket_code ON support_tickets;
CREATE TRIGGER trg_support_ticket_code
BEFORE INSERT ON support_tickets
FOR EACH ROW
EXECUTE FUNCTION generate_ticket_code();

CREATE INDEX IF NOT EXISTS idx_support_tickets_tenant ON support_tickets(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON support_tickets(status, priority);
CREATE INDEX IF NOT EXISTS idx_support_tickets_created ON support_tickets(created_at DESC);

ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;
```

- [ ] **Step 4: Ejecutar el test para verificar que pasa**

Run: `npm test src/lib/__tests__/supportMigration.test.js`  
Expected: PASS

- [ ] **Step 5: Commit de la migración**

```bash
git add supabase/migrations/2026-10-03_support_tickets.sql src/lib/__tests__/supportMigration.test.js
git commit -m "feat(db): add support_tickets migration and table schema"
```

---

### Task 2: Backend API de Tickets de Soporte

**Files:**
- Create: `api/_lib/routes/supportRoutes.js`
- Modify: `api/[[...path]].js`
- Test: `api/_lib/__tests__/supportRoutes.test.js`

**Interfaces:**
- Produces:
  - `supportTicketCreate(req, res)`: `POST /api/support/tickets`
  - `superSupportTicketsList(req, res)`: `GET /api/super/support/tickets`
  - `superSupportTicketPatch(req, res, id)`: `PATCH /api/super/support/tickets/:id`

- [ ] **Step 1: Escribir los tests unitarios del router de soporte**

```javascript
// api/_lib/__tests__/supportRoutes.test.js
import { describe, it, expect, vi } from 'vitest'
import { parseSupportBody } from '../routes/supportRoutes.js'

describe('supportRoutes parser & validation', () => {
  it('valida campos obligatorios para creación de ticket', () => {
    const invalid = parseSupportBody({})
    expect(invalid.error).toBeDefined()

    const valid = parseSupportBody({
      tenant_id: '123e4567-e89b-12d3-a456-426614174000',
      tenant_name: 'Pirotecnia Demo',
      reported_by_name: 'Cajero 1',
      contact_phone: '3001234567',
      category: 'printer',
    })
    expect(valid.error).toBeNull()
    expect(valid.data.priority).toBe('medium')
  })
})
```

- [ ] **Step 2: Ejecutar el test para verificar que falla**

Run: `npm test api/_lib/__tests__/supportRoutes.test.js`  
Expected: FAIL

- [ ] **Step 3: Implementar `api/_lib/routes/supportRoutes.js`**

Implementar lógica de validación, inserción en Supabase con `supabaseAdmin`, listado con filtros (`status`, `tenant_id`, `priority`) y actualización de estado (`in_progress`, `resolved`, `closed`).

- [ ] **Step 4: Registrar las rutas en `api/[[...path]].js`**

Agregar los despachos en `route()`:
```javascript
// ---- SOPORTE Y MESA DE AYUDA ---------------------
if (route === '/support/tickets' && method === 'POST') return supportTicketCreate(req, res)
if (route === '/super/support/tickets' && method === 'GET') return superSupportTicketsList(req, res)
if (segments[0] === 'super' && segments[1] === 'support' && segments[2] === 'tickets' && segments[3] && method === 'PATCH') {
  return superSupportTicketPatch(req, res, segments[3])
}
```

- [ ] **Step 5: Ejecutar los tests de soporte**

Run: `npm test api/_lib/__tests__/supportRoutes.test.js`  
Expected: PASS

- [ ] **Step 6: Commit de las rutas de soporte**

```bash
git add api/_lib/routes/supportRoutes.js api/[[...path]].js api/_lib/__tests__/supportRoutes.test.js
git commit -m "feat(api): add support tickets endpoints for client and superadmin"
```

---

### Task 3: Utilidades de Telemetría y Enlace a WhatsApp

**Files:**
- Create: `src/lib/supportTelemetry.js`
- Create: `src/lib/whatsappSupport.js`
- Test: `src/lib/__tests__/supportTelemetry.test.js`
- Test: `src/lib/__tests__/whatsappSupport.test.js`

**Interfaces:**
- Produces:
  - `collectTechnicalContext({ invoice, location, register })`: retorna objeto con `{ ua, screen, online, qz_status, invoice_code, url, timestamp }`.
  - `buildWhatsAppSupportUrl({ ticketCode, tenantName, category, phone, customText })`: retorna URL codificada de `https://wa.me/...`.

- [ ] **Step 1: Escribir tests para `supportTelemetry.js` y `whatsappSupport.js`**

```javascript
// src/lib/__tests__/whatsappSupport.test.js
import { describe, it, expect } from 'vitest'
import { buildWhatsAppSupportUrl } from '../whatsappSupport.js'

describe('buildWhatsAppSupportUrl', () => {
  it('genera enlace con número oficial y mensaje codificado', () => {
    const url = buildWhatsAppSupportUrl({
      supportPhone: '573009999999',
      ticketCode: 'VND-1001',
      tenantName: 'El Cohetón',
      categoryLabel: 'Impresora',
    })
    expect(url).toContain('https://wa.me/573009999999')
    expect(url).toContain(encodeURIComponent('VND-1001'))
    expect(url).toContain(encodeURIComponent('El Cohetón'))
  })
})
```

- [ ] **Step 2: Ejecutar los tests para verificar que fallan**

Run: `npm test src/lib/__tests__/whatsappSupport.test.js`  
Expected: FAIL

- [ ] **Step 3: Implementar `supportTelemetry.js` y `whatsappSupport.js`**

Implementar recolección de contexto sin lanzar excepciones, y generación del mensaje formal de WhatsApp.

- [ ] **Step 4: Ejecutar los tests para verificar que pasan**

Run: `npm test src/lib/__tests__/whatsappSupport.test.js`  
Expected: PASS

- [ ] **Step 5: Commit de utilidades**

```bash
git add src/lib/supportTelemetry.js src/lib/whatsappSupport.js src/lib/__tests__/whatsappSupport.test.js
git commit -m "feat(support): add telemetry collection and whatsapp url builder"
```

---

### Task 4: Componente Modal de Soporte Guiado (`SupportModal.jsx`)

**Files:**
- Create: `src/components/SupportModal.jsx`
- Test: `src/components/__tests__/SupportModal.test.jsx`

**Interfaces:**
- Produces:
  - `<SupportModal isOpen={boolean} onClose={function} />`

- [ ] **Step 1: Escribir test del componente modal**

Verificar que renderiza las 5 categorías, permite avanzar a la descripción, ingresa el teléfono y maneja el estado de confirmación con el ticket generado y el botón de WhatsApp.

- [ ] **Step 2: Ejecutar el test para verificar que falla**

Run: `npm test src/components/__tests__/SupportModal.test.jsx`  
Expected: FAIL

- [ ] **Step 3: Implementar `SupportModal.jsx`**

- Tarjetas táctiles de categorías (`printer`, `payment`, `inventory`, `auth`, `system`, `other`).
- Sub-selector de problema común con ayuda rápida inmediata (ej: "¿Cómo verificar comprobante Nequi?" o "Reiniciar servicio QZ Tray").
- Input de teléfono / WhatsApp con persistencia en `localStorage.getItem('pv_last_contact_phone')`.
- Botón "Enviar a Mesa de Soporte" conectado a `POST /api/support/tickets`.
- Pantalla de éxito con ticket badge (`VND-1001`) y botón verde de WhatsApp.

- [ ] **Step 4: Ejecutar el test para verificar que pasa**

Run: `npm test src/components/__tests__/SupportModal.test.jsx`  
Expected: PASS

- [ ] **Step 5: Commit del modal de soporte**

```bash
git add src/components/SupportModal.jsx src/components/__tests__/SupportModal.test.jsx
git commit -m "feat(ui): add 3-step guided support modal with quick diagnostics"
```

---

### Task 5: Integración del Acceso a Soporte en Topbar y Avisos de Error

**Files:**
- Modify: `src/components/Topbar.jsx`
- Modify: `src/components/ErrorNotice.jsx`
- Test: `src/components/__tests__/TopbarSupport.test.jsx`

**Interfaces:**
- Consumes: `<SupportModal />`
- Produces: Botón de soporte accesible en Topbar (ícono salvavidas) y atajo de teclado `F12`.

- [ ] **Step 1: Escribir test de integración en Topbar**

Verificar que el botón de soporte aparece en la barra superior y al hacer clic abre el modal.

- [ ] **Step 2: Ejecutar test para verificar que falla**

Run: `npm test src/components/__tests__/TopbarSupport.test.jsx`  
Expected: FAIL

- [ ] **Step 3: Modificar `Topbar.jsx` y `ErrorNotice.jsx`**

- Agregar ícono `LifeBuoy` con etiqueta "Soporte Vendra" en `Topbar.jsx`.
- Integrar listener de tecla `F12` para invocar el modal de soporte.
- Agregar en `ErrorNotice.jsx` un botón secundario discreto: *"¿Persiste el error? Reportar a soporte"*.

- [ ] **Step 4: Ejecutar test para verificar que pasa**

Run: `npm test src/components/__tests__/TopbarSupport.test.jsx`  
Expected: PASS

- [ ] **Step 5: Commit de integración en Topbar**

```bash
git add src/components/Topbar.jsx src/components/ErrorNotice.jsx src/components/__tests__/TopbarSupport.test.jsx
git commit -m "feat(ui): integrate support trigger in topbar with F12 shortcut and error notices"
```

---

### Task 6: Panel de Mesa de Soporte en `SuperDashboard.jsx`

**Files:**
- Create: `src/pages/super/SupportDeskTab.jsx`
- Modify: `src/pages/SuperDashboard.jsx`
- Test: `src/pages/super/__tests__/SupportDeskTab.test.jsx`

**Interfaces:**
- Consumes: `GET /api/super/support/tickets`, `PATCH /api/super/support/tickets/:id`
- Produces: Vista de mesa de ayuda con tabla de incidencias, filtros, ficha técnica y botón de chat por WhatsApp.

- [ ] **Step 1: Escribir test de `SupportDeskTab.jsx`**

Verificar renderizado de la lista de tickets, filtrado por estado (`open`, `in_progress`, `resolved`), cambio de estado y apertura del modal de detalle técnico.

- [ ] **Step 2: Ejecutar test para verificar que falla**

Run: `npm test src/pages/super/__tests__/SupportDeskTab.test.jsx`  
Expected: FAIL

- [ ] **Step 3: Implementar `SupportDeskTab.jsx` e integrarlo en `SuperDashboard.jsx`**

- Vista con métricas rápidas (Abiertos, Críticos, En atención).
- Selector de filtros (Estado, Prioridad, Tenant).
- Tabla responsiva con badges y botón directo **"Chatear por WhatsApp"**.
- Drawer/Modal de inspección de telemetría (navegador, factura activa, errores asociados).
- Acciones de ticket: *Tomar caso*, *Marcar Resuelto*, *Cerrar*.
- Integrar la pestaña "Soporte" en la navegación superior de `SuperDashboard.jsx`.

- [ ] **Step 4: Ejecutar test para verificar que pasa**

Run: `npm test src/pages/super/__tests__/SupportDeskTab.test.jsx`  
Expected: PASS

- [ ] **Step 5: Commit del panel de soporte**

```bash
git add src/pages/super/SupportDeskTab.jsx src/pages/SuperDashboard.jsx src/pages/super/__tests__/SupportDeskTab.test.jsx
git commit -m "feat(superadmin): add support desk tab with ticket management and diagnostics"
```

---

### Task 7: Actualizaciones en Tiempo Real (Supabase Realtime) y Sonido de Alerta

**Files:**
- Modify: `src/pages/super/SupportDeskTab.jsx`
- Test: `src/pages/super/__tests__/SupportDeskRealtime.test.jsx`

**Interfaces:**
- Consumes: Canal de Supabase Realtime para la tabla `support_tickets`.
- Produces: Inserción automática de tickets entrantes en la tabla sin recargar y contador reactivo.

- [ ] **Step 1: Escribir test para el manejador de eventos Realtime de soporte**

- [ ] **Step 2: Ejecutar test para verificar comportamiento inicial**

- [ ] **Step 3: Implementar suscripción Realtime en `SupportDeskTab.jsx`**

- Conectar al canal `support_tickets_changes` usando el cliente de Supabase.
- Cuando llega un `INSERT` con `status = 'open'`, agregar al inicio de la lista y reproducir alerta acústica/visual si es de prioridad alta/crítica.
- Cuando llega un `UPDATE`, sincronizar el estado local.

- [ ] **Step 4: Ejecutar test para verificar que pasa**

Run: `npm test src/pages/super/__tests__/SupportDeskRealtime.test.jsx`  
Expected: PASS

- [ ] **Step 5: Commit de tiempo real**

```bash
git add src/pages/super/SupportDeskTab.jsx src/pages/super/__tests__/SupportDeskRealtime.test.jsx
git commit -m "feat(realtime): add live incident updates to support desk via supabase realtime"
```

---

### Task 8: Verificación Global End-to-End

**Files:**
- Test: `e2e/soporte.spec.js`

- [ ] **Step 1: Escribir prueba E2E de flujo completo**
  - Iniciar sesión como cajero en `/caja`.
  - Abrir modal de soporte vía Topbar o `F12`.
  - Enviar ticket de prueba ("Error en impresora").
  - Iniciar sesión como SuperAdmin en `/super`.
  - Verificar que el ticket aparece en la Mesa de Soporte con los datos de tienda y telemetría correctos.
  - Marcar el ticket como resuelto.
- [ ] **Step 2: Ejecutar la prueba E2E y suite completa de tests**
  Run: `npm test`
  Run: `npm run lint`
- [ ] **Step 3: Commit final de verificación**
```bash
git add e2e/soporte.spec.js
git commit -m "test(e2e): add end-to-end test for support ticket lifecycle"
```
