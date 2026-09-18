# 🏗️ Plan de Mejora Arquitectónica del Backend — PyroVenta

Este documento detalla el diagnóstico del backend actual y la hoja de ruta técnica para transformar la arquitectura en un sistema **modular, resiliente, tolerante a fallos y preparado para alta escala y facturación electrónica**.

---

## 1. Diagnóstico del Estado Actual

Actualmente, el backend de PyroVenta se ejecuta sobre **Vercel Serverless Functions** conectado a **Supabase (PostgreSQL)**. Funciona bien para el volumen inicial, pero presenta cuellos de botella claros ante el crecimiento del negocio y la integración con la DIAN:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            ARQUITECTURA ACTUAL                              │
│                                                                             │
│  [ HTTP Request ] ──► [ api/[[...path]].js ] (1.812 líneas monolíticas)     │
│                              │                                              │
│                              ├─► Router con condicionales if/else manuales  │
│                              ├─► Controladores de Auth, Catálogo, Caja      │
│                              ├─► Lógica de negocio mezclada con SQL         │
│                              └─► Llamadas directas a Supabase               │
│                                                                             │
│  ⚠️ Puntos Críticos:                                                        │
│  - Timeout de 10s en Vercel Hobby (la DIAN puede tardar hasta 8s).          │
│  - Todo el backend en un solo archivo por restricción del plan Hobby (12 f).│
│  - Sin sistema de colas en segundo plano (imposible reintentar caídas DIAN).│
│  - Riesgo de saturación de conexiones Postgres en picos de venta.           │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Principales Riesgos Identificados:

| Componente | Síntoma Actual | Riesgo ante Facturación Electrónica y Escala |
| :--- | :--- | :--- |
| **Enrutador Monolítico** | `api/[[...path]].js` tiene más de 1.800 líneas con decenas de `if (route === ...)` manuales. | Difícil de mantener, propenso a regresiones y complejo de testear unitariamente. |
| **Tiempo de Ejecución** | Límite de 10s por request en serverless gratuito. | Si la DIAN se satura, la petición muere con `504 Gateway Timeout`. El cajero no sabe si la factura pasó o no. |
| **Procesamiento Asíncrono** | Las serverless functions mueren al responder `res.json()`. | No hay hilos de fondo ni workers para reintentar transmisiones tributarias fallidas. |
| **Pool de Conexiones** | Cada invocación serverless crea clientes directos contra Supabase. | En temporada alta (ej. ventas de pirotecnia en diciembre con 20 puntos vendiendo al tiempo), se puede agotar el pool de Postgres (`53300 too many connections`). |

---

## 2. Arquitectura Propuesta: Modular, Desacoplada y Asíncrona

La arquitectura evoluciona hacia una estructura por **capas de responsabilidad** y un **patrón Outbox/Cola asíncrona**, manteniendo compatibilidad con Vercel y Supabase.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            NUEVA ARQUITECTURA                               │
│                                                                             │
│  [ Cliente POS / PWA ]                                                      │
│           │                                                                 │
│           ▼                                                                 │
│  [ api/index.js (Router Ligero) ] ────────────────────────┐                 │
│           │                                               │                 │
│           ├──► routes/authRoutes.js                       │                 │
│           ├──► routes/invoiceRoutes.js                    │                 │
│           ├──► routes/catalogRoutes.js                    │                 │
│           └──► routes/billingRoutes.js                    ▼                 │
│                       │                     [ Transacciones Rápidas <200ms] │
│                       ▼                                   │                 │
│           [ Services Layer ]                              │                 │
│           - invoiceService.js                             │                 │
│           - catalogService.js                             │                 │
│           - factusService.js                              │                 │
│                       │                                   │                 │
│                       ▼                                   ▼                 │
│           [ Supabase / Supavisor Pooler ] ◄───────────────┘                 │
│           - Tablas Principales (invoices, products)                         │
│           - Tabla factus_outbox (Cola de Facturación)                       │
│                       │                                                     │
│                       ▼ (Disparo asíncrono)                                 │
│           [ Worker de Emisión DIAN ]                                        │
│           (Supabase Webhook / Edge Function o Upstash QStash)               │
│                       │                                                     │
│                       ▼                                                     │
│           [ API FACTUS / DIAN ]                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Pilares de la Transformación

### Pilar 1: Modularización del Enrutador (Clean Routing)

En lugar de un archivo único de 1.800 líneas, el backend se organiza en módulos de dominio dentro de `api/`:

```
api/
├── [[...path]].js            # Dispatcher ultraligero (< 60 líneas)
└── _lib/
    ├── routes/               # Mapeo de rutas y validación de entrada
    │   ├── authRoutes.js
    │   ├── invoiceRoutes.js
    │   ├── catalogRoutes.js
    │   ├── locationRoutes.js
    │   ├── closureRoutes.js
    │   ├── reportRoutes.js
    │   └── billingRoutes.js  # Rutas de Factus y clientes DIAN
    ├── services/             # Lógica de negocio pura (desacoplada de HTTP)
    │   ├── authService.js
    │   ├── invoiceService.js
    │   ├── pricingService.js
    │   ├── stockService.js
    │   └── factusService.js  # Comunicación, tokens y armado de payload Factus
    ├── database/
    │   ├── pool.js           # Conexión optimizada (Supavisor Transaction Pooler)
    │   └── outbox.js         # Operaciones de la cola de emisión
    └── middleware/
        ├── auth.js           # Validación JWT y roles
        ├── cors.js
        └── errorHandler.js   # Manejo centralizado de errores con Sentry
```

**Beneficio:** Código 100% testeable, modular y legible. Permite que múltiples desarrolladores trabajen sin colisiones en un solo archivo gigante.

---

### Pilar 2: Patrón Outbox para Facturación DIAN (Cero Bloqueo en Caja)

El cobro en caja **nunca debe depender de si la DIAN responde en 1 segundo o en 10 segundos**.

#### Tabla de Cola en Supabase (`factus_outbox`):
```sql
CREATE TABLE factus_outbox (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  invoice_id   UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  status       TEXT NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'retrying')),
  attempts     INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  next_retry   TIMESTAMPTZ NOT NULL DEFAULT now(),
  payload      JSONB NOT NULL,          -- JSON exacto listo para enviar a Factus
  response     JSONB,                  -- Respuesta DIAN o mensaje de error
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_factus_outbox_queue ON factus_outbox(status, next_retry)
  WHERE status IN ('pending', 'retrying');
```

#### Flujo Operativo:
1. **Paso 1 (En Caja):** Al cobrar la factura en `/invoices/:code/pay`, la factura se guarda como `status = 'paid'`, se genera el recibo de venta y se inserta una fila en `factus_outbox` con `status = 'pending'`.
2. **Paso 2 (Respuesta Inmediata):** El endpoint responde `200 OK` al cajero en **150-250ms**.
3. **Paso 3 (Procesamiento Asíncrono):** El worker procesa la fila:
   - Si Factus responde con éxito: actualiza `invoices` con el CUFE, consecutivo y QR, y marca el outbox como `completed`.
   - Si Factus/DIAN falla (red caída o DIAN en mantenimiento): incrementa `attempts`, calcula retroceso exponencial (`next_retry = now() + (attempts * 2 minutes)`) y lo marca como `retrying`.
   - Si se superan los intentos máximos: pasa a `failed` y notifica al panel de administración para reintento manual.

---

### Pilar 3: Gestión de Conexiones a Base de Datos (Connection Pooling)

Para soportar los picos de venta masiva en puntos físicos (donde múltiples cajeros y vendedores operan en simultáneo):

1. **Uso de Supavisor (Transaction Pooler):**
   - Configurar la conexión backend a través del puerto `6543` (modo transacción) de Supabase en lugar del puerto directo `5432`.
   - Esto permite que cientos de funciones serverless concurrentes compartan un número reducido de conexiones reales a PostgreSQL sin saturar la base de datos.
2. **Consultas Livianas con Proyección de Columnas:**
   - Evitar `SELECT *` en endpoints de alta frecuencia. Proyectar únicamente las columnas necesarias.

---

### Pilar 4: Resiliencia y Modo de Contingencia DIAN

La normativa DIAN estipula el procedimiento ante caídas de servicio:
1. **Contingencia Tipo 03 (Factura de Contingencia):** Si la DIAN reporta indisponibilidad prolongada, Factus permite emitir con `operation_type: "03"`.
2. **Venta Offline en Caja:** La PWA de PyroVenta ya almacena transacciones pendientes localmente en caso de corte de internet en el local. Al restablecer la red, el sistema sincroniza las facturas al backend y el outbox las transmite ordenadamente a la DIAN.

---

## 4. Hoja de Ruta de Implementación en 3 Fases

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ FASE 1: Reorganización Modular del Backend (Sin romper nada)                │
│ - Extraer api/[[...path]].js en routers por dominio (api/_lib/routes/*).    │
│ - Crear capa de servicios (api/_lib/services/*).                            │
│ - Ejecutar suite de pruebas actual (vitest) para validar cero regresiones.  │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
┌──────────────────────────────────────▼──────────────────────────────────────┐
│ FASE 2: Implementación del Motor de Facturación y Cola                      │
│ - Migración SQL: tablas tenant_factus_configs, customers y factus_outbox.   │
│ - Implementar factusAuth.js (gestor de tokens OAuth2 con caché).            │
│ - Implementar factusService.js (traductor de ítems/impuestos a formato DIAN)│
│ - Crear endpoint de despacho del worker (/api/internal/process-dian-queue). │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
┌──────────────────────────────────────▼──────────────────────────────────────┐
│ FASE 3: Conexión con Caja, Impresión y Despliegue en Producción             │
│ - Integrar selector de Factura Electrónica en CajaPage.                     │
│ - Imprimir código QR oficial y CUFE en tickets térmicos (80mm/58mm).        │
│ - Pestaña de configuración en AdminPage para credenciales de Factus.        │
│ - Realizar pruebas de set de habilitación DIAN en ambiente Sandbox.         │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 5. Beneficios Inmediatos de la Mejora

1. **Velocidad en Mostrador:** El cajero nunca espera a la DIAN. Cero filas estancadas.
2. **Tolerancia a Fallos:** Si la DIAN tiene fallas intermitentes, el sistema reintenta automáticamente sin pérdida de facturas.
3. **Escalabilidad Limpia:** El sistema queda preparado para pasar de 3 puntos de venta a 50+ sin reescribir la lógica ni colapsar la base de datos.
4. **Mantenibilidad:** Separación clara entre presentación HTTP, reglas de negocio y persistencia en base de datos.
