# 🎆 PyroVenta

Sistema de control de ventas para establecimientos pirotécnicos con múltiples puntos de venta.

**Stack:** React + Vite · Node.js Serverless Functions (Vercel) · Supabase (PostgreSQL + Realtime) · Tailwind CSS v3 · Zustand · QZ Tray + jsPDF

---

## Flujo de negocio

```
Vendedor → arma carrito → genera CÓDIGO de 4 dígitos
Cliente  → va a la caja con el código
Cajera   → ingresa código → selecciona método de pago → cobra
          → opcionalmente imprime recibo térmico
```

---

## Setup local

### 1. Prerequisitos

- Node.js 20+
- Cuenta en [Supabase](https://supabase.com) (gratis)
- Cuenta en [Vercel](https://vercel.com) (gratis) para deploy
- Vercel CLI: `npm i -g vercel` (opcional para dev local con serverless)

### 2. Clonar e instalar

```bash
git clone <repo-url>
cd pyroventa
npm install
```

### 3. Variables de entorno

Copia `.env.example` a `.env`:

```bash
cp .env.example .env
```

Edita `.env` con tus credenciales de Supabase:

```env
# Frontend (expuesto al browser)
VITE_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Backend (solo serverless functions — NUNCA prefijo VITE_)
SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

Donde encontrar las credenciales en el dashboard de Supabase:
- `Settings` → `API` → **Project URL** → `VITE_SUPABASE_URL` y `SUPABASE_URL`
- `Settings` → `API` → **anon public** → `VITE_SUPABASE_ANON_KEY`
- `Settings` → `API` → **service_role** → `SUPABASE_SERVICE_KEY`

### 4. Ejecutar en desarrollo

```bash
# Opción A: con Vercel CLI (activa las serverless functions localmente)
vercel dev

# Opción B: solo frontend (las llamadas /api fallarán sin el CLI)
npm run dev
```

La app estará disponible en `http://localhost:3000` (Vercel CLI) o `http://localhost:5173` (Vite solo).

---

## Configuración de Supabase

### Paso 1: Crear las tablas (Schema)

1. Ve a tu proyecto en [supabase.com/dashboard](https://supabase.com/dashboard)
2. Click en **SQL Editor** (ícono de terminal en el sidebar)
3. Copia y pega el contenido de [`supabase/schema.sql`](./supabase/schema.sql)
4. Click **Run** (▶)

Esto crea todas las tablas, índices, la función `get_next_invoice_code` y las políticas RLS.

### Paso 2: Cargar datos iniciales (Seed)

1. En el SQL Editor, copia y pega [`supabase/seed.sql`](./supabase/seed.sql)
2. Click **Run**

Esto inserta los 3 puntos de venta, 4 categorías, 12 productos y 5 vendedores.

**PINs de prueba:**
| Vendedor | PIN  | Rol      | Puntos asignados             |
|----------|------|----------|------------------------------|
| Carlos   | 1111 | Seller   | Local Principal + Stand Norte|
| Sandra   | 2222 | Seller   | Local Principal              |
| Javier   | 3333 | Seller   | Stand Norte + Stand Sur      |
| María    | 4444 | Cashier  | Stand Sur                    |
| **Admin**| **0000** | **Admin** | Todos               |

### Paso 3: Habilitar Realtime

1. Ve a **Database** → **Replication** en el dashboard
2. En "Source", activa la tabla **`invoices`** con el toggle
3. Esto habilita `postgres_changes` para la suscripción en CajaPage

### Paso 4: Verificar RLS

Las políticas ya están incluidas en el `schema.sql`. Verifica en:
**Authentication** → **Policies**

- `anon` puede hacer SELECT en `locations`, `categories`, `products`, `presentations`
- Todo lo demás requiere la service key (usada solo en serverless functions)

### Paso 5: Fotos de productos (Storage)

Los productos pueden tener foto (carga individual o masiva vía Excel).

1. Si tu base de datos es anterior a esta funcionalidad, ejecuta en el SQL Editor
   [`supabase/migrations/2026-07-20_product_images.sql`](./supabase/migrations/2026-07-20_product_images.sql)
   (solo agrega la columna `products.image_url`; el `schema.sql` completo ya la incluye)
2. Crea el bucket de Storage ejecutando:

```bash
node scripts/setup-product-images.mjs
```

Esto crea el bucket público `product-images` (máx 2MB por foto, webp/jpeg/png) y
verifica la columna. La API también crea el bucket automáticamente en el primer upload.

**Carga masiva con fotos:** la plantilla Excel tiene una columna opcional `Imagen` con el
nombre del archivo de la foto (ej: `volcan.jpg`). En la vista previa de importación se
adjuntan las fotos: se emparejan por esa columna o por el nombre del producto
(sin importar tildes, mayúsculas o guiones), y se comprimen en el navegador
(WebP, máx 800px) antes de subirse a Storage bajo la carpeta del tenant.

### Paso 6: Cierre de caja, devoluciones, descuentos y bloqueo de login

Si tu base de datos es anterior a estas funciones, ejecuta en el SQL Editor
[`supabase/migrations/2026-07-21_caja_v2.sql`](./supabase/migrations/2026-07-21_caja_v2.sql)
(no destructivo). Habilita:

- **Cierre de caja (arqueo)**: la cajera cierra su caja desde la pantalla de Caja
  (🧾 Cerrar caja): el sistema muestra lo esperado según las facturas pagadas del día
  (efectivo/transferencia/datáfono), ella declara el efectivo contado y queda registrada
  la diferencia. El admin ve todos los cierres en Administración → Cajas.
- **Devoluciones**: facturas pagadas se pueden devolver con motivo obligatorio
  (↩ en Caja para las de hoy, o desde el Historial del admin para cualquier fecha).
  Las devueltas salen de los ingresos de los reportes automáticamente.
- **Descuentos**: al cobrar, la cajera puede aplicar un descuento en pesos; queda
  registrado en la factura y el total se ajusta.
- **Cambio en efectivo**: al cobrar en efectivo se puede digitar con cuánto paga el
  cliente y el sistema calcula el cambio a devolver.
- **Bloqueo de fuerza bruta**: 5 intentos fallidos de PIN (o de contraseña súper) en
  15 minutos bloquean nuevos intentos por 15 minutos (por empresa + IP).

### Monitoreo de errores (opcional, Sentry)

Crea un proyecto gratuito en [sentry.io](https://sentry.io) y configura:

```env
# Frontend (errores del browser)
VITE_SENTRY_DSN=https://...@...ingest.sentry.io/...
# Backend (excepciones no controladas del API)
SENTRY_DSN=https://...@...ingest.sentry.io/...
```

Sin estas variables el SDK ni siquiera se carga — cero impacto.

---

## Configuración de impresión térmica

### Opción 1: QZ Tray (impresora USB o WiFi)

QZ Tray es una aplicación de escritorio que funciona como puente entre el navegador y la impresora.

**Instalación:**
1. Descarga QZ Tray desde [qz.io/download](https://qz.io/download) (Windows/Mac/Linux)
2. Instala y ejecuta la aplicación
3. QZ Tray corre en segundo plano y expone un WebSocket en `localhost:8182`

**Verificar que funciona:**
- El ícono de QZ Tray debe aparecer en la bandeja del sistema
- En la app PyroVenta, el botón "Impresora térmica" funcionará automáticamente
- Si QZ Tray no está corriendo, la app hace fallback a `window.print()`

**Configurar la impresora por punto de venta:**
1. En PyroVenta, ve a **Admin** → **Puntos de venta** → **Editar**
2. Activa "Usar QZ Tray" e ingresa el nombre exacto de la impresora (como aparece en Windows)
3. Selecciona el ancho de papel (58mm o 80mm)

**Impresoras probadas:**
- Epson TM-T20III (USB, 80mm)
- Epson TM-T20II (USB, 80mm)
- Bixolon SRP-350III (USB/WiFi, 80mm)
- Genéricas POS de 58mm vía USB

### Opción 2: Impresión desde el navegador

Si no tienes QZ Tray, el sistema hace fallback automático a `window.print()`:
- Se abre una ventana con el recibo formateado para la impresora
- El sistema operativo maneja la impresión
- Funciona con cualquier impresora instalada en Windows/Mac/Linux
- Para mejores resultados, selecciona "Sin márgenes" en el diálogo de impresión

### Opción 3: PDF

Siempre disponible como alternativa. Genera un PDF de 80×220mm.

---

## Deploy en Vercel

### Paso 1: Conectar repositorio

1. Sube el código a GitHub/GitLab
2. Ve a [vercel.com/new](https://vercel.com/new)
3. Importa el repositorio
4. Vercel detecta automáticamente que es un proyecto Vite

**Configuración del proyecto en Vercel:**
- Framework Preset: **Vite**
- Build Command: `npm run build`
- Output Directory: `dist`
- Install Command: `npm install`

### Paso 2: Variables de entorno en Vercel

1. Ve al proyecto en Vercel → **Settings** → **Environment Variables**
2. Agrega las 4 variables (para todos los entornos: Production, Preview, Development):

```
VITE_SUPABASE_URL       = https://xxxxxxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY  = eyJ...
SUPABASE_URL            = https://xxxxxxxxxxxx.supabase.co
SUPABASE_SERVICE_KEY    = eyJ...
```

### Paso 3: Deploy

```bash
# Via CLI
vercel deploy --prod

# O simplemente haz push a main/master y Vercel despliega automáticamente
git push origin main
```

### Paso 4: Configurar dominio personalizado (opcional)

En Vercel → Settings → Domains → Add Domain

---

## Estructura del proyecto

```
pyroventa/
├── api/                          ← Serverless functions (backend)
│   ├── _lib/
│   │   ├── supabaseAdmin.js      ← Cliente Supabase con service key
│   │   ├── cors.js               ← Headers CORS
│   │   └── auth.js               ← Verificación de token
│   ├── auth/login.js             ← POST /api/auth/login
│   ├── locations/                ← GET/POST /api/locations
│   ├── products/                 ← GET/POST/PUT/DELETE /api/products
│   ├── invoices/                 ← CRUD facturas + pay + cancel
│   ├── reports/                  ← daily, sellers, locations
│   └── sellers/                  ← CRUD vendedores
├── src/                          ← Frontend React
│   ├── pages/
│   │   ├── LoginPage.jsx         ← /login
│   │   ├── VendedorPage.jsx      ← /vender
│   │   ├── CajaPage.jsx          ← /caja
│   │   └── AdminPage.jsx         ← /admin
│   ├── components/               ← Componentes reutilizables
│   ├── store/                    ← Zustand stores
│   ├── lib/                      ← Utilities (api, format, print, supabase)
│   └── styles/index.css
├── supabase/
│   ├── schema.sql                ← DDL completo
│   └── seed.sql                  ← Datos iniciales
├── public/
│   └── print.css                 ← Estilos @media print
├── .env.example
├── vercel.json                   ← Configuración de rutas Vercel
├── vite.config.js
├── tailwind.config.js
└── package.json
```

---

## Roles y acceso

| Ruta     | Rol requerido      | Descripción                          |
|----------|--------------------|--------------------------------------|
| /login   | Público            | Selección de punto de venta + PIN    |
| /vender  | seller, admin      | Catálogo, carrito, generación código |
| /caja    | cashier, admin     | Búsqueda código, cobro, impresión    |
| /admin   | admin              | Reportes, CRUD completo              |

---

## Notas de desarrollo

### Sobre el token de autenticación

El sistema usa un token simple `base64(sellerId:locationId)` para el MVP. Para producción se recomienda migrar a JWT con `jsonwebtoken` y expiración.

### Sobre la generación de códigos

Los códigos de factura (1000-9999) se generan via función PostgreSQL `get_next_invoice_code()` que corre atómicamente y evita race conditions cuando dos vendedores crean facturas simultáneamente.

El índice parcial `UNIQUE WHERE status = 'pending'` garantiza unicidad solo entre facturas pendientes, permitiendo reusar códigos una vez cobrada/cancelada la factura.

### Sobre Supabase Realtime

CajaPage se suscribe al canal `postgres_changes` de la tabla `invoices` filtrado por `location_id`. Esto actualiza la lista de pendientes en tiempo real cuando un vendedor crea una factura.

Fallback: polling cada 30 segundos para casos donde el WebSocket esté inestable.

### Cache de productos

El catálogo de productos se cachea en `localStorage` con TTL de 5 minutos por punto de venta. Se invalida automáticamente al expirar.

---

## Soporte

Para reportar bugs o solicitar funcionalidades, abre un issue en el repositorio.

**¡Manipule con responsabilidad! 🎆**
