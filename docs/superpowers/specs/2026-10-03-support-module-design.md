# VENDRA POS — Módulo de Soporte y Mesa de Ayuda (Design Spec)

**Fecha:** 2026-10-03  
**Estado:** Aprobado para Planificación  
**Autor:** Antigravity / flightdev  
**Objetivo:** Proporcionar un canal de asistencia accesible y guiado para el personal de las tiendas (cajeros, vendedores, administradores) y una Mesa de Soporte centralizada en tiempo real para el equipo de plataforma (Flightdev / SuperAdmin).

---

## 1. Contexto y Justificación

VENDRA POS opera en entornos comerciales de alta velocidad (puntos de venta y ferias de pirotecnia y retail) donde cualquier bloqueo técnico o duda operativa detiene la fila de cobro. Los problemas típicos (fallas de conexión con la impresora térmica, comprobantes de transferencias bancarias dudosos, bloqueos por intentos fallidos de PIN o discrepancias de stock) requieren dos niveles de respuesta:
1. **Auto-resolución guiada inmediata:** Instrucciones claras en 2 o 3 pasos para que el operador de caja resuelva el problema sin esperar.
2. **Atención directa de la Mesa de Soporte (Flightdev):** Si el problema persiste, el operador genera un reporte con 3 toques que envía toda la telemetría del equipo (navegador, estado de red, datos de factura, log de error) directamente a la Mesa de Ayuda de SuperAdmin, con enlace directo para contacto por WhatsApp.

---

## 2. Catálogo de Escenarios de Soporte

El cliente selecciona la situación a través de un asistente guiado con 5 categorías principales:

### 2.1. Impresora Térmica y Periféricos (`printer`)
- **Escenarios comunes:**
  - QZ Tray no conecta (WebSocket `localhost:8182` caído o servicio detenido).
  - Papel atascado o no corta.
  - Recibo impreso en blanco o con caracteres extraños (desalineación 58mm vs 80mm).
- **Auto-guía en app:**
  - Botón "Probar conexión con QZ Tray" directo en el modal.
  - Botón "Imprimir vía Navegador (Fallback)" para no detener la venta.
- **Snapshot capturado:** Estado de conexión QZ Tray, nombre de impresora configurada, ancho de papel (`58mm` / `80mm`), user agent del navegador y sistema operativo.

### 2.2. Caja, Facturación y Cobros (`payment`)
- **Escenarios comunes:**
  - Comprobante de transferencia bancaria sospechoso o no verificado (Nequi, Daviplata, Bancolombia).
  - Cobro aprobado en datáfono pero no registrado en el sistema.
  - Código de venta temporal (4 dígitos) expirado o no encontrado en caja.
  - Devolución de factura pagada o anulación especial requerida.
- **Snapshot capturado:** Código de factura activa (si hay una en pantalla), total de la venta, método de pago seleccionado, `register_id` y `location_id`.

### 2.3. Inventario y Precios (`inventory`)
- **Escenarios comunes:**
  - Venta bloqueada por stock insuficiente (`INSUFFICIENT_STOCK`).
  - Precio en sistema no coincide con el precio anunciado en el local.
  - Producto faltante o inactivo en el punto de venta.
- **Snapshot capturado:** Lista de ítems en carrito, diferencias registradas en auditoría de precios.

### 2.4. Cuentas, Usuarios y Acceso (`auth`)
- **Escenarios comunes:**
  - PIN bloqueado tras 5 intentos fallidos (bloqueo de fuerza bruta de 15 minutos).
  - Olvido de credenciales de administrador o vendedor.
  - Alerta de licencia por vencer o vencida (`LICENSE_EXPIRED`).
- **Snapshot capturado:** Identificador de tenant (`tenant_id`), IP pública detectada, rol del usuario que intenta entrar.

### 2.5. Error del Sistema / Bloqueo (`system`)
- **Escenarios comunes:**
  - Pantalla congelada o botón sin respuesta.
  - Falla de conexión a internet o cola offline (`offlineQueue`) atascada.
  - Error 500 del servidor.
- **Snapshot capturado:** Estado `navigator.onLine`, URL actual, último ID de evento capturado por Sentry (si existe), estado de almacenamiento local (offline storage).

---

## 3. Experiencia de Usuario (Frontend)

### 3.1. En la aplicación del Cliente (`/vender`, `/caja`, `/admin`)
1. **Punto de Entrada Universal (Topbar y Mensajes de Error):**
   - Botón en `Topbar.jsx` con ícono de salvavidas (`LifeBuoy` / `HelpCircle`) etiquetado como "Soporte Vendra" (atajo de teclado `F12` o clic).
   - En cualquier banner de error crítico (`ErrorNotice`, fallas en cobro o conexión de QZ Tray), se incluye un enlace directo: *"¿Necesitas ayuda? Reportar este problema a soporte"*.
2. **Modal de Soporte en 3 Pasos (`SupportModal.jsx`):**
   - **Paso 1 (Categoría):** 5 tarjetas táctiles grandes con ícono y texto descriptivo.
   - **Paso 2 (Problema y Auto-resolución):** Selección del síntoma específico. Si existe auto-guía (ej: reiniciar QZ Tray o cambiar a impresión de navegador), se muestran 2 pasos rápidos con botón de acción. Si no aplica o no funcionó, el usuario escribe notas breves opcionales.
   - **Paso 3 (Contacto y Envío):** Teléfono / WhatsApp de contacto de quien reporta (se recuerda en `localStorage` o se toma del perfil).
3. **Confirmación y Enlace a WhatsApp:**
   - Se muestra el código generado (ej: `VND-2041`).
   - Botón destacado: **"Abrir WhatsApp con Soporte"** con enlace `https://wa.me/<NUMERO_FLIGHTDEV>?text=...` que contiene el código, nombre de la tienda, punto de venta y resumen del problema prellenado.

### 3.2. En la Mesa de Soporte del SuperAdmin (`/super`)
1. **Pestaña "Soporte" en `SuperDashboard.jsx`:**
   - Contador de tickets abiertos en tiempo real (badge dinámico en la cabecera).
   - Tabla interactiva con filtros:
     - Estado: `Abierto`, `En Atención`, `Resuelto`, `Todos`.
     - Prioridad: `Crítica (Caja parada)`, `Alta`, `Media`, `Baja`.
     - Empresa (`tenant`): Selector para filtrar por cliente.
2. **Ficha de Detalle de Incidencia:**
   - Datos del negocio: Nombre de tenant, punto de venta, caja, nombre del operador.
   - Botón de 1 clic: **"Contactar por WhatsApp"** para iniciar chat de soporte de inmediato con el cliente.
   - Panel de Telemetría Técnica:
     - Navegador, versión, pantalla donde ocurrió.
     - Datos de factura / QZ Tray / errores Sentry asociados.
   - Acciones de Gestión:
     - Botón "Tomar ticket" (cambia a `in_progress` y asigna al agente actual).
     - Botón "Resolver" (pide notas breves de solución y marca `resolved`).
     - Botón "Cerrar / Descartar".

---

## 4. Arquitectura de Datos y Backend

### 4.1. Esquema de Base de Datos (`supabase/migrations/2026-10-03_support_tickets.sql`)

```sql
-- ---- TICKETS DE SOPORTE Y MESA DE AYUDA -------------
CREATE TABLE support_tickets (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_code       TEXT NOT NULL UNIQUE,                       -- Ej: VND-1001
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

-- Secuencia para códigos amigables VND-1001, VND-1002...
CREATE SEQUENCE support_ticket_seq START WITH 1001;

CREATE OR REPLACE FUNCTION generate_ticket_code()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.ticket_code IS NULL OR NEW.ticket_code = '' THEN
    NEW.ticket_code := 'VND-' || nextval('support_ticket_seq')::TEXT;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_support_ticket_code
BEFORE INSERT ON support_tickets
FOR EACH ROW
EXECUTE FUNCTION generate_ticket_code();

-- Índices de consulta frecuente
CREATE INDEX idx_support_tickets_tenant ON support_tickets(tenant_id, created_at DESC);
CREATE INDEX idx_support_tickets_status ON support_tickets(status, priority);
CREATE INDEX idx_support_tickets_created ON support_tickets(created_at DESC);

-- Habilitar RLS
ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;
```

### 4.2. Endpoints en `api/[[...path]].js` y `api/_lib/routes/supportRoutes.js`

1. **`POST /api/support/tickets` (Creación de ticket):**
   - Autenticación: Acepta token de sesión del vendedor/cajero (`pv_token`) o parámetros de tenant en caso de problemas de login.
   - Genera el registro con el contexto técnico del cliente.
   - Retorna `{ ticket: { id, ticket_code, status, ... }, support_whatsapp: string }`.
2. **`GET /api/super/support/tickets` (Listado para Mesa de Soporte):**
   - Requiere autenticación de SuperAdmin (`pv_super_token`).
   - Soporta filtros: `?status=open&tenant_id=...&priority=critical`.
3. **`PATCH /api/super/support/tickets/:id` (Actualización de estado):**
   - Permite cambiar status (`in_progress`, `resolved`, `closed`), asignar agente y guardar notas de resolución.

### 4.3. Supabase Realtime
- Publicar eventos de `INSERT` y `UPDATE` en la tabla `support_tickets` para que el panel de SuperAdmin actualice la lista instantáneamente sin polling.

---

## 5. Pruebas y Criterios de Aceptación

1. **Creación de Ticket desde la Tienda:**
   - Un cajero o administrador puede abrir el modal con un solo clic/toque, seleccionar su problema, ingresar su número de WhatsApp y recibir un código de ticket en menos de 10 segundos.
   - El enlace de WhatsApp abre una conversación con el número oficial de soporte de Flightdev con los datos precargados.
2. **Telemetría Automática:**
   - El ticket almacena correctamente la tienda, punto de venta, caja, factura activa, estado de red y navegador sin que el usuario tenga que escribirlo.
3. **Mesa de Soporte en SuperDashboard:**
   - Cuando entra un ticket nuevo, aparece de inmediato en `/super` vía Realtime.
   - El agente de soporte de Flightdev puede hacer clic en "Contactar por WhatsApp", ver el diagnóstico y resolver el ticket dejando notas.
4. **Resiliencia:**
   - Si no hay conexión a internet al momento de reportar, el ticket se almacena en la cola local para enviarse al reconectar, y se ofrece el número de WhatsApp directo en pantalla como respaldo.
