# VENDRA · Sistema de marca

> Documento vivo para diseño y desarrollo. Si este archivo y el código no coinciden, manda este archivo y se corrige el código.
> Versión 1.0 · Octubre 2026 · Marca de producto de **flightdev**

---

## 1. Arquitectura de marca

| Nivel | Marca | Función |
|---|---|---|
| Casa matriz | **flightdev** | Desarrolla y respalda. Nunca protagonista frente al cajero. |
| Plataforma | **vendra.** | La marca que el negocio conoce, dice y busca. |
| Producto | **vendra. POS** | Punto de venta. Futuros módulos: Stock, Pedidos, Pagos, Tienda. |

### Dónde aparece "by flightdev"

| Sí | No |
|---|---|
| Pie de la web y de la app (fuera de la caja) | Pantalla de cobro activa |
| Pie del ticket térmico | Encabezado o menú de la caja |
| Login y pantalla de carga | Junto a VENDRA al mismo tamaño |
| Contratos, facturas, propuestas | Publicidad dirigida al cliente final del negocio |

Siempre como "by flightdev", a no más de ¼ del alto de las letras de "vendra.".

---

## 2. Logotipo

**vendra.** en minúsculas, inclinado 9°, construido así:

- **v**: mitad inferior del rombo de marca a 45°. Brazo izquierdo en Voltaje `#B4E854`, brazo derecho en Voltaje Profundo `#7FB52E`, partidos en el eje vertical.
- **endra**: Space Grotesk Bold con contorno adicional de 2,6 u (≈ +17 % de grosor) para monitores de caja de baja densidad.
- **.**: rombo partido de 30 u apoyado en la línea base.
- Todo convertido a trazos. No hay `<text>` ni fuentes dentro de los SVG.

### Archivos (`public/brand/`)

| Archivo | Uso |
|---|---|
| `vendra-symbol.svg` | Rombo partido aislado. Menú colapsado, avatar, sello. Mín. 16 px. |
| `vendra-logo-horizontal.svg` | Principal sobre fondo oscuro. |
| `vendra-logo-horizontal-light.svg` | Sobre fondo claro (letras en Azul Vuelo `#0D2348`). |
| `vendra-pos-horizontal.svg` | Con distintivo POS. Menú de la caja. |
| `vendra-with-endorsement.svg` | Con "by flightdev". Login, splash, pie de página. |
| `vendra-thermal-1bit.svg` | Negro sobre blanco con corte de 1,6 u entre facetas. Tickets de 58 y 80 mm. |
| `vendra-favicon.svg` | 48 × 48 sobre Noche, radio 8. |
| `../icon-192.svg`, `../icon-512.svg` | Íconos de la PWA (sin radio: el sistema aplica la máscara). |

### Tamaños mínimos

| Pieza | Digital | Impreso |
|---|---|---|
| Logo horizontal | 28 px de alto (≈ 145 px de ancho) | 25 mm de ancho |
| Símbolo | 16 px | 5 mm |
| Ticket térmico | 320 puntos de ancho (40 mm a 203 ppp) | — |

### Usos incorrectos

- Cambiar los colores de las facetas o poner las dos del mismo color (salvo la versión térmica o monocromo).
- Quitar la inclinación, rotar o deformar.
- Reemplazar el punto por un círculo o un cuadrado.
- Escribir "vendra." con una fuente en lugar de usar el archivo.
- Añadir sombras, degradados o contornos.
- Poner "flightdev" al mismo tamaño o pegado al logo.

---

## 3. Color

### Marca

| Token | Hex | Uso |
|---|---|---|
| `--vd-voltaje` | `#B4E854` | Acción principal, línea de fila activa, acentos, faceta clara |
| `--vd-voltaje-profundo` | `#7FB52E` | Faceta del pliegue, picos de gráficas |
| `--vd-on-voltaje` | `#0A1428` | Texto siempre que el fondo sea Voltaje |

### Tema oscuro · predeterminado en caja

| Token | Hex | Uso | Contraste sobre Noche |
|---|---|---|---|
| `--vd-bg` | `#0A1428` Noche | Fondo | — |
| `--vd-surface` | `#10243F` Superficie | Tarjetas, paneles | — |
| `--vd-text` | `#EEF2F7` Hueso | Texto principal | 16:1 |
| `--vd-text-muted` | `#93A4BD` | Texto secundario | 7.2:1 |
| `--vd-text-subtle` | `#586686` Pista | Íconos, bordes, texto ≥ 18 px | 3.2:1 |
| `--vd-link` | `#2F8CFF` Azul Cielo | Enlaces, badges informativos | 5.5:1 |
| — | `#B4E854` Voltaje | Totales, acentos | 12.8:1 |

> **Pista (`#586686`) no alcanza 4.5:1** sobre Noche. Para texto secundario de tamaño normal se usa `--vd-text-muted`.

### Tema claro · oficina, reportes, impresión

| Token | Hex | Uso |
|---|---|---|
| `--vd-bg` | `#F6F8FB` Nube | Fondo |
| `--vd-surface` | `#FFFFFF` | Tarjetas |
| `--vd-selection` | `#DCEBFF` Horizonte | Fila seleccionada |
| `--vd-text` | `#0D2348` Azul Vuelo | Texto principal |
| `--vd-link` | `#1C63C4` | Enlaces (Azul Cielo no llega a 4.5:1 sobre blanco) |

### Regla estricta de contraste

**Nunca texto Voltaje sobre blanco o fondos claros** (1.4:1). En tema claro, Voltaje solo se usa como relleno de botón con texto Noche. Lo mismo para ámbar y coral: en claro se usan `--vd-ok-ink`, `--vd-warn-ink`, `--vd-error-ink`.

### Estados

| Estado | Oscuro | Claro (texto) | Ejemplos |
|---|---|---|---|
| Correcto | `#B4E854` | `#3F6B0F` | Pagado, caja cuadrada |
| Atención | `#FFB547` | `#8A5200` | Stock bajo, pendiente |
| Error | `#FF7A66` | `#B02A1C` | Sin existencia, rechazado |

> **Decisión tomada:** Correcto comparte color con el botón principal. Para que el cajero no confunda acción con resultado, los estados siempre llevan texto o ícono ("Pagado ✓"), nunca solo color, y el botón Cobrar es el único elemento Voltaje de relleno grande en pantalla.

### Tailwind

Las clases existentes conservan su nombre y cambian de valor:

| Clase | Antes | Ahora |
|---|---|---|
| `bg-surface-500` | `#111111` | Noche `#0A1428` |
| `bg-surface-300` | `#1a1a1a` | Superficie `#10243F` |
| `text-white` | blanco | Hueso / Azul Vuelo según tema |
| `bg-brand-500`, `text-brand-400` | naranja | Voltaje |
| `font-syne` / `font-dm` / `font-mono` | Syne / DM Sans / DM Mono | Space Grotesk / Figtree / JetBrains Mono |

Para código nuevo: `bg-vendra-voltaje`, `text-vendra-hueso`, `rounded-vendra`, `font-display`, `font-ui`.

---

## 4. Tipografía

| Rol | Familia | Pesos | Clase |
|---|---|---|---|
| Títulos, nombres de módulo | Space Grotesk | 500, 600, 700 | `font-display` (`font-syne`) |
| Interfaz, tablas, formularios | Figtree | 400, 500, 600, 700 | `font-ui` (`font-dm`) |
| Precios, totales, códigos, atajos, tickets | JetBrains Mono | 400, 500, 700 | `font-mono` |

| Nivel | Tamaño / alto de línea | Peso |
|---|---|---|
| Título de pantalla | 28 / 32 | Space Grotesk 700, tracking −0.02em |
| Sección | 20 / 26 | Space Grotesk 600 |
| Texto de interfaz | 16 / 24 | Figtree 500 |
| Secundario | 14 / 20 | Figtree 400 |
| Etiqueta de tabla | 11 / 16 | JetBrains Mono 500, mayúsculas, tracking 0.06em |
| Total del ticket | 44 / 48 | JetBrains Mono 700, tracking −0.03em |

Cifras siempre en JetBrains Mono, alineadas a la derecha.

---

## 5. Componente `VendraLogo`

`src/components/VendraLogo.jsx`

| Prop | Valores | Por defecto |
|---|---|---|
| `variant` | `'symbol' \| 'horizontal' \| 'pos' \| 'endorsement' \| 'thermal'` | `'horizontal'` |
| `theme` | `'dark' \| 'light' \| 'monochrome'` | `'dark'` |
| `size` | `'sm'` 28 px · `'md'` 48 px · `'lg'` 88 px · o número | `'md'` |
| `className`, `title` | — | — |

```jsx
import VendraLogo from '../components/VendraLogo'
import { useTheme } from '../lib/theme'

// Menú de la caja
<VendraLogo variant="pos" size="sm" theme={useTheme()} />

// Login / splash
<VendraLogo variant="endorsement" size="lg" />

// Menú colapsado
<VendraLogo variant="symbol" size={20} />

// Hereda el color del texto (p. ej. sobre un botón)
<span className="text-white"><VendraLogo theme="monochrome" size="sm" /></span>
```

### Ticket térmico

Las impresoras térmicas no leen SVG. Rasterizar `vendra-thermal-1bit.svg` a PNG de 1 bit, 320 px de ancho para 58 mm o 448 px para 80 mm, y enviarlo con `escpos-buffer` como imagen. Umbral recomendado: luminancia < 140 → negro.

---

## 6. Aplicación por vista

### Caja (Vender, Cobro)

- [ ] Tema oscuro por defecto; el cajero puede cambiar a claro si hay mucha luz.
- [ ] `VendraLogo variant="pos" size="sm"` en el menú. Sin "by flightdev".
- [ ] Botón Cobrar: único botón de relleno Voltaje, texto Noche, ≥ 56 px de alto, atajo F12 visible.
- [ ] Total en JetBrains Mono 700, Voltaje, ≥ 40 px.
- [ ] Fila activa: línea izquierda de 3 px en Voltaje.
- [ ] Todo operable con teclado: F1–F5 módulos, `/` buscar, Enter agregar/confirmar, Esc cancelar.

### Inventario, Clientes

- [ ] Etiquetas de estado con texto + color (Disponible, Stock bajo, Sin existencia).
- [ ] Existencias y precios en JetBrains Mono alineados a la derecha.

### Reportes, Corte de caja, Dashboard

- [ ] Funcionan en ambos temas; al imprimir o exportar PDF se fuerza el claro.
- [ ] Barras en Voltaje Profundo; valor destacado en Voltaje (oscuro) o `#3F6B0F` (claro).
- [ ] Pie de página exportado: "Generado con vendra. · by flightdev".

### Ticket impreso

- [ ] Encabezado: nombre y datos del negocio cliente, no de VENDRA.
- [ ] Pie: `vendra-thermal-1bit.svg` a 40 mm + "by flightdev".
- [ ] Solo negro sobre blanco; sin grises ni tramas.

### Login y pantalla de carga

- [ ] Fondo Noche, `VendraLogo variant="endorsement" size="lg"`.
- [ ] Barra de progreso de 3 px en Voltaje.

---

## 7. Tono de voz

Directo, seguro, verbo primero. Frases que se leen mientras se atiende.

| Momento | Sí | No |
|---|---|---|
| Abrir caja | Caja 1 lista. Fondo: $500.00. | La sesión de caja ha sido inicializada correctamente. |
| Sin existencia | Sin existencia. Quedan 0 de [Producto]. | Error 409: stock insuficiente. |
| Tarjeta rechazada | Tarjeta rechazada. Intenta otra forma de pago. | La transacción no pudo ser procesada por el emisor. |
| Caja cuadrada | Caja cuadrada. Vendiste $13,680.00 hoy. | El proceso de corte finalizó sin diferencias. |
| Lema | **Cobra en segundos.** | La solución integral de punto de venta. |

Reglas:

- Tuteo.
- Cifras exactas, con dos decimales y signo de pesos.
- Un error dice qué pasó y qué hacer, en ese orden.
- Sin signos de exclamación en mensajes de error.

---

## 8. Historial

| Versión | Fecha | Cambio |
|---|---|---|
| 1.0 | Oct 2026 | Migración de PyroVenta a VENDRA POS. Logotipo 3a "V de rombo cincelada". |
