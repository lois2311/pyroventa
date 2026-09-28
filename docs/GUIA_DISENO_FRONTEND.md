# 🎨 Guía de diseño del frontend — PyroVenta

Este documento explica **qué se cambió en la interfaz, por qué, y cómo mantenerla consistente**. Está pensado para quien agregue una vista nueva o toque una existente: antes de inventar un estilo, revisa si ya hay un token, una clase o un componente que lo resuelva.

---

## 1. Diagnóstico inicial

La auditoría se hizo sobre todas las vistas (Login, Vender, Caja, Administración con sus 9 pestañas y el Panel de plataforma con su login), en cuatro anchos: **390 px** (teléfono), **820 px** (tablet), **1280 px** (laptop) y **2000 px** (monitor ancho).

| # | Problema encontrado | Impacto | Solución aplicada |
|---|---|---|---|
| 1 | Sin contenedor de ancho máximo: cada pestaña usaba su propio `max-w` (2xl, 3xl, 5xl o ninguno), todas alineadas a la izquierda | En 2000 px las barras de "Por método de pago" medían 1.700 px y las listas dejaban media pantalla vacía | `.page-container`: centrado, tope de `90rem` y margen lateral fluido |
| 2 | Gráfico de ventas con `preserveAspectRatio="none"` y texto dentro del SVG | Los números del eje se estiraban (`$ 1 . 3 M`) al ensanchar la tarjeta | Solo la geometría queda en el SVG; ejes y tooltip son HTML |
| 3 | KPI principal en `text-3xl` fijo en una grilla de 2 columnas | En el teléfono `$2.983.999` se salía de su tarjeta | Tamaño con *container query units* (`cqi`): el número se adapta al ancho de **su** tarjeta |
| 4 | 126 tamaños arbitrarios `text-[9px]`, `text-[10px]`, `text-[11px]` | Texto ilegible en ejes, badges y metadatos | Token `text-2xs` = 11 px como piso tipográfico |
| 5 | Alturas de controles distintas (inputs 42 px, botones 32/40/44 px) | Barras de filtros desalineadas | Variable `--control-h`: 40 px con mouse, 44 px con dedo |
| 6 | 20 overlays de modal hechos a mano (z-index, fondo, alineación y padding distintos); los del panel de plataforma sin foco atrapado ni Escape | Comportamiento impredecible y barreras de teclado | Componente `<Modal>` + clases `.modal-*` |
| 7 | Texto blanco sobre naranja `brand-500`, `green-600`, `yellow-600` y textos `gray-500` | Contraste entre 2,8:1 y 3,9:1 (falla WCAG AA, pide 4,5:1) | Texto oscuro sobre naranja; tonos `-700` con texto blanco; `gray-400` como gris mínimo para texto |
| 8 | Menú de Administración en móvil: botón naranja flotante que abría un cajón | Tapaba contenido y ocultaba en qué sección estabas | Barra de secciones horizontal, fija bajo la barra superior |
| 9 | Un `sr-only` dentro de una tabla con scroll horizontal, sin `position: relative` en el contenedor | La página entera tenía 116 px de scroll horizontal en el teléfono | `relative` en todo contenedor `overflow-x-auto` |
| 10 | Inputs con fuente de 14 px | iOS Safari hace zoom al enfocar el buscador y la vista queda desencuadrada | En pantallas `< 640px` los campos suben a 16 px |
| 11 | Fechas en formato ISO o estadounidense (`09/23`) | Lectura ajena al usuario colombiano | `formatDayShort` → `mié 23 sep`; `formatRangeLabel` → `22 sep – 28 sep 2026` |
| 12 | Toasts con `w-full max-w-sm right-4` | En 390 px quedaban 10 px fuera de la pantalla | De borde a borde con margen en móvil; a la derecha desde `sm` |
| 13 | Emoji como íconos (🏆 🖥 📍 📤 📷 🧾) mezclados con `lucide-react` | Dos lenguajes visuales, tamaño y color no controlables | Solo `lucide-react` para íconos de interfaz (los emoji de categorías son **datos** y se mantienen) |
| 14 | `border-white/8` usado en varias tarjetas sin existir en la escala de opacidad | La clase no generaba CSS: el borde no se veía | Se agregó el paso `8` a la escala de opacidad |

---

## 2. Principios

1. **Mobile-first, breakpoints por contenido.** Se diseña primero para 360–390 px y se agregan columnas cuando el contenido lo pide, no porque "llegó `md`".
2. **Ancho acotado.** Más allá de ~1440 px una fila de dashboard obliga al ojo a recorrer demasiado y las barras pierden proporción. Por eso el contenido se centra con tope; en textos corridos, `max-w-prose` (~65 caracteres por línea).
3. **Ritmo en múltiplos de 4 px.** Todo espaciado sale de la escala de Tailwind (4, 8, 12, 16, 20, 24, 32 px). Nada de `mt-[13px]`.
4. **Jerarquía antes que decoración.** Tamaño, peso y color de texto marcan el orden de lectura: página → sección → panel → etiqueta. Los bordes y fondos agrupan; no compiten.
5. **Consistencia vía primitivas.** Si dos vistas resuelven lo mismo, usan la misma clase o componente (`PageHeader`, `Modal`, `.toolbar`, `.btn-outline`…).
6. **Accesible por defecto.** Contraste AA, foco visible, objetivos táctiles de 44 px con el dedo, `prefers-reduced-motion`, etiquetas reales en los campos.
7. **Densidad según el contexto.** El POS (Vender, Caja) prioriza objetivos grandes y lectura a distancia; Administración prioriza densidad de datos.

---

## 3. Tokens

### 3.1 Breakpoints (Tailwind, mobile-first)

| Prefijo | Desde | Clase de ventana (Material 3) | Qué cambia en PyroVenta |
|---|---|---|---|
| — | 0 px | Compacta | 1 columna; hojas inferiores; barra de pestañas en Caja |
| `sm` | 640 px | Compacta/Mediana | Modales centrados; grillas de gestión a 2 columnas |
| `md` | 768 px | Mediana | Vender muestra el carrito lateral; Caja pasa a 2 columnas |
| `lg` | 1024 px | Expandida | Sidebar de Administración; Caja a 3 columnas; rankings lado a lado |
| `xl` | 1280 px | Grande | KPIs en una fila (el principal ocupa 2 de 5); Historial se vuelve tabla alineada |
| `2xl` | 1536 px | Extra grande | 3 columnas en grillas de gestión; carrito de `24rem` |
| `3xl` | 1920 px | Extra grande | Disponible para monitores de cabina |

### 3.2 Layout

| Token | Valor | Uso |
|---|---|---|
| `--gutter` / `px-gutter` | `clamp(1rem, 0.5rem + 2vw, 2rem)` | Margen lateral fluido: 16 px en teléfono → 32 px desde ~1200 px, sin saltos |
| `max-w-content` | `90rem` (1440 px) | Tope de ancho de las vistas de datos |
| `--topbar-h` | `3.5rem` | Altura de la barra superior (la barra de secciones se pega debajo con `top-14`) |
| `100dvh` | — | Alto de pantalla real en móvil (descuenta la barra de direcciones; `100vh` no lo hace) |
| `env(safe-area-inset-*)` | — | Notch y barra de inicio del iPhone: botón flotante del carrito, hojas y toasts |

### 3.3 Controles

| Token | Mouse / trackpad | Dedo (`pointer: coarse`) |
|---|---|---|
| `--control-h` (inputs, `.btn`, `.segmented`, `.btn-touch-safe`) | 40 px | 44 px |
| `--control-h-sm` (`.btn-sm`, `.chip`) | 32 px | 40 px |
| `.btn-lg`, `.input-lg` | 48 px | 48 px |

Una sola altura para inputs, selects y botones hace que una barra de filtros quede alineada sin ajustes manuales. El salto a 44 px con el dedo sigue la recomendación de Apple HIG y WCAG 2.5.5.

### 3.4 Tipografía

| Rol | Clase | Tamaño | Fuente |
|---|---|---|---|
| Título de página | `.page-title` | 20 → 24 px | Syne 700 |
| Título de sección | `.section-title` | 16 px | Syne 600 |
| Título de panel | `.panel-title` | 14 px | DM Sans 600 |
| Texto | `text-sm` / `text-base` | 14 / 16 px | DM Sans |
| Metadato | `text-xs` | 12 px | DM Sans |
| Micro-etiqueta | `text-2xs`, `.eyebrow` | 11 px | DM Sans (eyebrow: mayúsculas + tracking) |
| Cifras en columnas | `font-mono tabular-nums` | — | DM Mono (alinean verticalmente) |
| KPI | `MetricTile` | 16–52 px según ancho | DM Sans 600, cifras proporcionales |

- **11 px es el piso** (equivale a *label small* de Material 3). Nada más chico.
- `tabular-nums` solo donde los números se comparan en columna (tablas, ejes, montos en listas). Las cifras grandes aisladas (KPIs) usan cifras proporcionales: se ven más compactas.
- `text-wrap: balance` en `h1–h3` evita palabras huérfanas en títulos.

### 3.5 Color y contraste

- **Superficies** (de más oscura a más clara): `surface-600` fondo de login/plataforma → `surface-500` fondo de app → `surface-400` barra superior / tarjetas → `surface-300` paneles → `surface-200` modales → `surface-50` chips y pistas de barras.
- **Marca:** `brand-500` como fondo lleva **texto oscuro** (`text-surface-700`, 7:1). Blanco sobre `brand-500` da 2,8:1 y no pasa AA.
- **Botones de estado con texto blanco:** tonos `-700` (`green-700` 5,0:1, `blue-700` 6,7:1, `pink-700` 6,0:1, `red-700` 6,5:1). Los `-600` quedan en 3,3:1.
- **Grises de texto:** `gray-400` es el mínimo para texto sobre las superficies oscuras (≈ 6,8:1). `gray-500` solo para íconos decorativos.
- **Métodos de pago** (en todo el sistema): verde = efectivo (`#15803d`), azul = transferencia (`#3b82f6`), **rosa = datáfono** (`#ec4899`). Viven en `src/lib/chartTheme.js` (`PAY_COLORS`) y Tailwind los expone como `bg-pay-cash`, `bg-pay-transfer`, `bg-pay-card`: gráficos, barras, chips y botones usan el mismo valor. Datáfono era violeta, pero con deuteranopía quedaba a ΔE 1,3 del azul de transferencia (indistinguibles en la dona y las barras apiladas); la paleta actual pasa todas las verificaciones del validador (ver §6). El color va en el ícono o la marca; **el monto va en tinta neutra**.
- `color-scheme: dark` en `:root`: el calendario de `<input type="date">`, los `<select>` y las barras de scroll nativas se dibujan oscuros (antes el ícono del calendario era gris oscuro sobre fondo oscuro).

### 3.6 Radios, bordes y capas

- Radios: `rounded-lg` controles · `rounded-xl` tarjetas y paneles · `rounded-2xl` modales · `rounded-full` chips y badges.
- Bordes: `border-white/5` separación sutil · `border-white/10` controles · color de marca solo para estado activo.
- `z-index`: barra de secciones `30` · barra superior `40` · modales `50` · banner de red `100` · cajón móvil `1200` · toasts `9998` · bloqueo de licencia `10000`.

---

## 4. Clases y componentes

### 4.1 Clases (`src/styles/index.css`, capa `components`)

| Clase | Para qué |
|---|---|
| `.page-container` | Contenedor de página: centrado, `max-w-content`, `px-gutter` |
| `.page-title` `.section-title` `.panel-title` `.eyebrow` | Jerarquía tipográfica |
| `.toolbar` | Fila de filtros: alineados por la base (labels arriba), con salto de línea |
| `.panel` `.panel-header` `.list-row` | Lista agrupada: una superficie con filas divididas (`divide-y`), en vez de una tarjeta por fila |
| `.card` | Tarjeta; padding 16 → 20 px desde `sm` |
| `.btn` `.btn-primary` `.btn-outline` `.btn-ghost` `.btn-danger` `.btn-success` | Botones; `.btn-outline` reemplaza el antiguo `btn btn-ghost border border-white/10` |
| `.btn-sm` `.btn-lg` `.btn-icon` `.btn-touch-safe` | Tamaños; `.btn-icon` es cuadrado (combinar con ghost/outline) |
| `.segmented` | Control segmentado (rangos Hoy / 7 días / 30 días); estado con `aria-pressed` |
| `.chip` | Filtro tipo píldora (categorías, motivos); estado con `aria-pressed` |
| `.input` `.input-lg` `.field-label` `.field-hint` | Campos de formulario |
| `.modal-backdrop` `.modal-panel` `.modal-header` `.modal-title` `.modal-body` `.modal-footer` | Estructura de diálogo (la usa `<Modal>`; los modales de detalle usan backdrop + panel) |

### 4.2 Componentes

| Componente | Uso |
|---|---|
| `PageHeader` | Título + descripción + acciones de cada vista. Acciones abajo en móvil, a la derecha desde `sm` |
| `SectionHeader` | Encabezado de sección dentro de una vista (h2) |
| `Modal` | Diálogo estándar: hoja inferior en móvil, centrado desde `sm`; encabezado y pie fijos; foco atrapado, Escape y devolución de foco; `onSubmit` para formularios; `closeOnBackdrop={false}` en formularios largos |
| `EmptyState` | Estado vacío: ícono, mensaje, ayuda y acciones |
| `MetricTile` | KPI con count-up, variación vs período anterior (con texto, no solo color) y tamaño por *container query* |
| `DateRangeBar` | Desde / Hasta + rangos rápidos que marcan cuál está activo |
| `charts/ChartTooltip` | Tooltip común de Recharts: valor primero, línea llave del color de la serie, total opcional y pie de detalle |

### 4.3 Hook `useModalA11y`

Devuelve un *callback ref* para el panel del diálogo: atrapa el foco, cierra con Escape y devuelve el foco a quien abrió el modal. El foco inicial va al primer campo (salta la "X" marcada con `data-modal-close`) o al elemento con `data-autofocus`. Guarda `onClose` en una ref: pasarle una función inline ya no hace que el foco salte en cada render.

---

## 5. Patrones de layout por vista

| Vista | Patrón |
|---|---|
| **Administración (shell)** | Barra superior fija. Secciones: barra horizontal desplazable (con fundido en los bordes) en móvil/tablet; sidebar fijo de `14rem` desde `lg`. Contenido en `.page-container` |
| **Resumen** | `PageHeader` con Actualizar/Exportar → filtros en `.toolbar` → KPIs con sparkline (el principal a lo ancho; desde `xl`, 5 columnas donde ocupa 2) → dona de métodos de pago + barras por categoría → ventas por día (Tendencia / Por método) + tabla diaria → rankings en 2 columnas → cajas → puntos |
| **Usuarios, Puntos, Productos** | Grilla de tarjetas `1 → 2 (sm) → 3 (2xl)`, acciones al pie de cada tarjeta |
| **Cajas** | Grupos por punto de venta (grilla `1 → 2 → 3`) + sección de cierres con lista agrupada |
| **Historial** | Filas apiladas en pantallas angostas; desde `xl`, grilla de columnas alineadas con encabezado |
| **Vender** | Catálogo en `grid-cols-[repeat(auto-fill,minmax(min(100%,16rem),1fr))]`: las columnas salen solas según el espacio (1 → 2 → 3 → 5). Carrito lateral `16rem → 20rem → 24rem` |
| **Caja** | Grilla: `md` = pendientes + (búsqueda y cobro apilados); `lg+` = tres columnas. El contenedor del medio usa `display: contents` desde `lg`, así el mismo DOM sirve a los dos layouts. `h-[100dvh]`: cada columna hace scroll por su cuenta y la barra de pestañas móvil queda fija |
| **Login / Plataforma** | Tarjeta centrada con `px-gutter`; plataforma en `max-w-6xl` |

---

## 6. Visualización de datos

### 6.1 Stack

- **Recharts 3** (`recharts` + `react-is@18`, que debe coincidir con la versión de React). Solo lo importan Administración y el panel de plataforma, que se cargan con `React.lazy`: el bundle inicial de Vender/Caja bajó de 189,5 a 143,8 KB gzip aun sumando la librería, y el service worker precachea los chunks para uso offline.
- **Tokens en `src/lib/chartTheme.js`**: `PAY_COLORS`/`PAY_KEYS`/`PAY_LABELS` (métodos de pago, orden fijo), `CHART` (marca, grilla, ejes, gris de énfasis, superficie), `AXIS_TICK` (11 px, DM Mono) y `MAX_BAR` (24 px). Tailwind importa el mismo archivo.
- **`ChartTooltip`** para todos los tooltips y **`usePrefersReducedMotion`**: las animaciones de Recharts corren en JS (la regla CSS global no las alcanza), así que cada gráfico usa `isAnimationActive={!reducedMotion}`.

### 6.2 Gráficos

| Gráfico | Forma | Por qué |
|---|---|---|
| Ventas por día — *Tendencia* | Área de un tono, curva `monotone` (no se pasa de los datos), línea de promedio diario, punto final fijo | Tendencia en el tiempo de una sola serie |
| Ventas por día — *Por método* | Barras apiladas efectivo / transferencia / datáfono, solo el tramo superior redondeado | Parte del todo a lo largo del tiempo |
| Por método de pago | Dona de ≤ 3 segmentos + leyenda con monto y % | Parte del todo de un vistazo; los valores exactos están en la leyenda, no dependen de leer ángulos |
| Ventas por categoría | Barras horizontales de un tono, valor y % en la punta, cola agrupada en "Otros" | Comparar magnitudes con nombres largos |
| Ventas por hora (detalle de vendedor/caja) | Columnas con **énfasis**: la hora pico en naranja con su valor, el resto en gris | La historia es "cuándo se vende más" |
| KPIs | Sparkline gris con el último punto en el acento | Tendencia de apoyo; la cifra es la protagonista |

### 6.3 Reglas aplicadas

- **Color validado, no a ojo.** Paletas categóricas probadas con `validate_palette.js` (skill de dataviz) sobre la superficie real, todos los pares. El color sigue a la entidad y nunca a su puesto en un ranking.
- **Marcas finas:** línea de 2 px, relleno ≈ 10–20 %, barras ≤ 24 px con punta de 4 px redondeada, separación de 2 px del color de la superficie entre segmentos y anillo de 2 px en los puntos.
- **Grilla y ejes recesivos:** líneas de 1 px sólidas, sin línea vertical; ticks con valores "redondos" y formato compacto (`$500k`, `$1,2M`); margen interno en el eje X para que la última etiqueta no se corte.
- **Un solo eje Y.** Nunca doble eje; las facturas van en el tooltip, no en una segunda escala.
- **Tooltip:** empieza por el valor en tinta blanca, cada serie con una línea llave de su color, total en las barras apiladas y crosshair / banda de hover que cubre todo el tramo del día.
- **Dona sin tooltip encima:** al pasar sobre un segmento o su fila de la leyenda, el centro muestra ese método y el resto se atenúa, sin tapar el total.
- **Teclado:** la capa de accesibilidad de Recharts permite enfocar el gráfico y recorrer los días con las flechas; cada gráfico lleva un `figcaption` oculto con el resumen para lectores de pantalla. Los sparklines son decorativos (`aria-hidden`, sin foco).
- **Siempre hay vista en tabla o valores rotulados:** la tabla diaria repite todo lo del gráfico de días; dona, categorías y hora pico muestran sus valores sin hover.
- **Recargar conserva el marco:** mientras llegan datos nuevos, los gráficos quedan con opacidad reducida en vez de volver al esqueleto.
- **El alto incluye el eje X** (sin scroll interno) y los paneles se adaptan con *container queries* (`.cq` / `.cq-row`): la dona va arriba de su leyenda en un panel angosto y al lado cuando hay espacio.

---

## 7. Accesibilidad (checklist)

- [x] Contraste AA (4,5:1) en texto normal; ver §3.5.
- [x] Foco visible (`:focus-visible` naranja de 2 px) en botones, enlaces y pestañas.
- [x] Objetivos táctiles: 44 px con puntero grueso; botones de cantidad del carrito de 32 px (antes 24).
- [x] Diálogos con `role="dialog"`, `aria-modal`, `aria-labelledby`, foco atrapado y Escape (patrón WAI-ARIA APG).
- [x] Todo campo tiene `<label>` o `aria-label` (antes varios solo tenían placeholder).
- [x] Estado de toggles con `aria-pressed` y de navegación con `aria-current`.
- [x] Toasts en una región `aria-live` montada siempre (se anuncian al aparecer).
- [x] Sin animaciones infinitas en el dashboard (se quitó el brillo pulsante del KPI principal); `prefers-reduced-motion` desactiva las demás.
- [x] Sin scroll horizontal de página en 390 px (WCAG 1.4.10 *Reflow*); las tablas anchas hacen scroll dentro de su panel.
- [x] La variación de los KPIs dice "+/−" y "vs. período anterior": no depende solo del color.

---

## 8. Receta: agregar una vista nueva

```jsx
import PageHeader, { SectionHeader } from '../components/PageHeader.jsx'
import EmptyState from '../components/EmptyState.jsx'
import Modal from '../components/Modal.jsx'

function MiVista() {
  return (
    <div className="space-y-6">                     {/* ritmo entre bloques */}
      <PageHeader
        title="Proveedores"
        description="12 proveedores activos"
        actions={<button className="btn-primary"><Plus className="h-4 w-4" /> Nuevo proveedor</button>}
      />

      <div className="toolbar panel p-3 sm:p-4">…filtros con .field-label + .input…</div>

      {items.length === 0
        ? <EmptyState icon={Truck} title="Aún no hay proveedores" />
        : <ul className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">…tarjetas .card…</ul>}
    </div>
  )
}
```

Dentro de Administración la vista ya queda en `.page-container`; fuera de ella, envuélvela en `<div className="page-container py-6 sm:py-8">`.

Antes de dar la vista por terminada, revisa en 390 / 820 / 1280 / 2000 px: sin scroll horizontal, controles alineados, textos ≥ 11 px y nada tapado por la barra superior o el botón flotante.

---

## 9. Referencias

**Layout y responsive**
- Tailwind CSS v3 — Responsive design: https://v3.tailwindcss.com/docs/responsive-design
- Tailwind CSS v3 — Reusing styles (`@apply`, capas): https://v3.tailwindcss.com/docs/reusing-styles
- Tailwind CSS v3 — Estados y variantes (`aria-*`, `has-*`, `group-*`): https://v3.tailwindcss.com/docs/hover-focus-and-other-states
- web.dev — Responsive web design basics: https://web.dev/articles/responsive-web-design-basics
- web.dev — Unidades de viewport `svh`/`lvh`/`dvh`: https://web.dev/blog/viewport-units
- MDN — Container queries: https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_containment/Container_queries
- MDN — `clamp()`: https://developer.mozilla.org/en-US/docs/Web/CSS/clamp
- MDN — `display` (incluye `contents`): https://developer.mozilla.org/en-US/docs/Web/CSS/display
- MDN — `env()` y áreas seguras: https://developer.mozilla.org/en-US/docs/Web/CSS/env
- MDN — `@media (pointer)`: https://developer.mozilla.org/en-US/docs/Web/CSS/@media/pointer
- MDN — `color-scheme`: https://developer.mozilla.org/en-US/docs/Web/CSS/color-scheme
- MDN — `text-wrap`: https://developer.mozilla.org/en-US/docs/Web/CSS/text-wrap
- Material Design 3 — Window size classes: https://m3.material.io/foundations/layout/applying-layout/window-size-classes
- Every Layout (composición con primitivas): https://every-layout.dev/
- Utopia (tipografía y espaciado fluidos con `clamp()`): https://utopia.fyi/

**Tipografía y jerarquía**
- Material Design 3 — Type scale: https://m3.material.io/styles/typography/type-scale-tokens
- Practical Typography — Largo de línea: https://practicaltypography.com/line-length.html
- Refactoring UI (jerarquía, espaciado, color): https://www.refactoringui.com/

**Gráficos**
- Recharts — Documentación y API (ver la prop `accessibilityLayer` en los gráficos cartesianos): https://recharts.github.io/

**Accesibilidad**
- WCAG 2.2: https://www.w3.org/TR/WCAG22/
- 1.4.3 Contraste mínimo: https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html
- 1.4.10 Reflow: https://www.w3.org/WAI/WCAG22/Understanding/reflow.html
- 2.2.2 Pausar, detener, ocultar: https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide.html
- 2.4.7 Foco visible: https://www.w3.org/WAI/WCAG22/Understanding/focus-visible.html
- 2.5.5 / 2.5.8 Tamaño de objetivo: https://www.w3.org/WAI/WCAG22/Understanding/target-size-enhanced.html · https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html
- 4.1.3 Mensajes de estado: https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html
- WAI-ARIA APG — Diálogo modal: https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/
- Apple HIG — Layout: https://developer.apple.com/design/human-interface-guidelines/layout
- Apple HIG — Accesibilidad (objetivos de 44 pt): https://developer.apple.com/design/human-interface-guidelines/accessibility
- CSS-Tricks — 16 px evita el zoom de iOS en formularios: https://css-tricks.com/16px-or-larger-text-prevents-ios-form-zoom/
