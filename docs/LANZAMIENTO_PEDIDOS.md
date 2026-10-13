# Vendra Pedidos — guía de lanzamiento del piloto

Complementa `docs/PLAN_MAESTRO_VENDRA_PEDIDOS.md` (§8 condiciones de lanzamiento) y `docs/WORKER_OUTBOX.md`.
Nada de esto se ejecutó contra producción desde el repositorio: son pasos manuales, en este orden.

## 1. Base de datos (SQL Editor de Supabase, en orden)

Antes, verificar que el esquema de producción coincide con el del repositorio (el plan maestro lo exige).
Las migraciones son aditivas e idempotentes; ninguna borra datos ni toca facturas, caja o inventario.

| # | Archivo | Qué crea |
|---|---|---|
| 1 | `2026-10-12_vendra_pedidos_schema.sql` | rol `driver`, columnas aditivas de `invoices`, `order_settings`, `delivery_zones` |
| 2 | `2026-10-13_vendra_pedidos_orders_schema.sql` | `order_customers` (la tabla `customers` de facturación electrónica no se toca), `customer_addresses`, `order_requests`, `order_request_items`, `payment_records`, `accept_policy` |
| 3 | `2026-10-14_vendra_pedidos_outbox_schema.sql` | `connect_outbox`, `integration_events` |
| 4 | `2026-10-15_vendra_pedidos_conversations_schema.sql` | `whatsapp_channels`, `conversations`, `messages` |
| 5 | `2026-10-16_vendra_pedidos_deliveries_schema.sql` | `deliveries` |

Migraciones previas que el código de pedidos da por aplicadas: `2026-07-20_product_images.sql` (fotos; si falta, el catálogo
público degrada sin fotos) y las de multiempresa/inventario ya en uso.

## 2. Variables de entorno (Vercel)

| Variable | Para qué |
|---|---|
| `JWT_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` | ya existentes |
| `CRON_SECRET` | autentica a `GET\|POST /api/internal/outbox/run` (sin ella responde 503) |
| `META_APP_SECRET` | valida la firma del webhook de WhatsApp (sin ella responde 503) |
| `WA_TOKEN_<NEGOCIO>` | token de acceso de Meta del canal; `whatsapp_channels.access_token_secret_ref` guarda su NOMBRE |

## 3. Worker del outbox

Programar `pg_cron` + `pg_net` según `docs/WORKER_OUTBOX.md` (cada minuto). Sin él, las notificaciones quedan en cola.
El panel *Configuración de pedidos → Operación y soporte* avisa si hay notificaciones esperando más de 15 minutos.

## 4. Canal de WhatsApp (Meta Cloud API)

1. En Meta: app con producto WhatsApp, número del comercio, token permanente de usuario del sistema.
2. Webhook de la app: `https://<DOMINIO>/api/integrations/whatsapp/meta/webhook`, con el `webhook_verify_token` que se define en el paso 3; suscribir el campo `messages`.
3. Dar de alta el canal (aún no hay pantalla; ejemplo en `docs/WORKER_OUTBOX.md`).
4. **Verificar el handshake en el despliegue real.** El webhook es una función aparte (`api/integrations/whatsapp/[provider]/webhook.js`, cuerpo crudo
   para la firma) con un rewrite explícito en `vercel.json`; no se pudo probar fuera de Vercel.

## 5. Configuración del comercio (panel Administración)

1. *Usuarios*: crear domiciliarios con el rol **Domiciliario** (entran con PIN al punto asignado → `/domicilios`).
2. *Config. pedidos*: identificador del enlace público, horario, formas de pago, instrucciones de transferencia, tarifa de domicilio,
   política de aceptación; activar **Recibir pedidos en línea**.
3. Compartir el enlace `https://<DOMINIO>/pedir/<identificador>` con los clientes.

## 6. Lista de verificación previa al lanzamiento (plan §8)

- [ ] Migraciones 1–5 aplicadas y comprobadas en un entorno de pruebas primero.
- [ ] `CRON_SECRET`, `META_APP_SECRET` y el token del canal configurados; cron programado.
- [ ] Handshake del webhook correcto; mensaje de prueba entrante aparece en *Conversaciones*; respuesta humana llega al teléfono.
- [ ] Pedido de prueba por el formulario → aceptar → asignar domiciliario → recoger → entregar; el cliente (que escribió antes) recibe los avisos.
- [ ] Operador (cajero/admin) y domiciliarios capacitados; cada domiciliario probó su PIN en su celular.
- [ ] Ninguna factura, movimiento de caja ni de inventario se generó con los pedidos de prueba.
- [ ] Alertas: revisar el panel de operación al menos al abrir y cerrar el día; Sentry activo.
- [ ] Lanzamiento controlado: un grupo reducido de clientes primero; ampliar tras revisar métricas y errores.

## 7. Contingencias

| Situación | Qué hacer |
|---|---|
| Meta caído o token vencido | Las notificaciones se reintentan solas (backoff hasta 5 intentos). Al agotarse quedan *fallidas* en el panel: corregir y pulsar **Reintentar**. |
| Cliente fuera de la ventana de 24 h | Meta solo admite plantillas aprobadas (aún no implementadas): el aviso falla de forma permanente y visible; contactar por teléfono. |
| Worker sin correr | El panel muestra "más antigua en cola". Revisar `cron.job_run_details` en Supabase y `CRON_SECRET`. |
| Pedidos duplicados | No deberían existir (idempotencia). Si se sospecha, comparar `idempotency_key` y `integration_events`. |

## 8. Desactivación y reversión

1. **Parar pedidos nuevos**: *Config. pedidos* → apagar "Recibir pedidos en línea" (el formulario deja de responder).
2. **Desconectar WhatsApp**: `update whatsapp_channels set status = 'disconnected' where tenant_id = '<tenant>';` — ignora mensajes entrantes y las notificaciones fallan de forma visible.
3. **Detener el worker**: `select cron.unschedule('vendra-outbox-run');`
4. Las tablas nuevas pueden quedarse: no afectan al POS. Nada requiere revertir migraciones para volver al estado anterior.

## 9. Lo que NO está verificado ni construido (límites conocidos)

- Webhook en Vercel real; entrega real a Meta (los tests simulan el proveedor).
- Plantillas de WhatsApp aprobadas (fuera de la ventana de 24 h) y su gestión.
- Pantalla de alta/desconexión de canales y de zonas de entrega múltiples.
- Cerrar/archivar conversaciones, cancelar pedidos (existe el estado, no el endpoint).
- Retención de mensajes de WhatsApp y de evidencias de pago (decisión pendiente; solo se purgan eventos técnicos: 30/90 días).
- Prueba de carga real: la suite simula concurrencia (30 envíos simultáneos con la misma clave) sobre una base en memoria.
- Conversión de pedido a factura POS: fuera del piloto por diseño (PR-09, requiere aprobación).
- Pruebas e2e visuales solo en tema oscuro, Chromium.
