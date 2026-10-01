import defaultColors from 'tailwindcss/colors.js'
import plugin from 'tailwindcss/plugin.js'
import { PAY_COLORS } from './src/lib/chartTheme.js'

// =====================================================================
// VENDRA POS — Tokens del sistema de diseño (Manual de marca VENDRA v1)
// ---------------------------------------------------------------------
// Temas: oscuro por defecto ("Modo Oscuro", el de la cabina de caja) y claro
// (oficina, reportes, impresión). Las clases siguen siendo las de siempre
// (text-white, bg-surface-300, text-brand-400…), pero los tokens que cambian
// de un tema a otro apuntan a variables CSS (--pv-*). Con
// <html data-theme="light"> se remapean:
//   - superficies: Noche/Superficie → Nube y tarjetas blancas;
//   - "white" (texto principal, bordes y velos con opacidad): Hueso → Azul Vuelo;
//   - neutros (gray-*) de la familia Pista, invertidos;
//   - Voltaje como TEXTO nunca va sobre fondo claro: brand-200/300/400 pasan a
//     un verde profundo (7.4:1 sobre blanco). En claro, Voltaje solo es relleno
//     de botón con texto Noche (bg-brand-500 + text-surface-700).
// Un subárbol con data-theme="dark" vuelve a los valores oscuros.
//
// Paleta oficial:
//   Voltaje          #B4E854  acción principal, indicador activo (12.8:1 sobre Noche)
//   Voltaje Profundo #7FB52E  pliegue del símbolo, acentos de gráficos
//   Noche            #0A1428  fondo de marca y de la app
//   Superficie       #10243F  tarjetas y paneles
//   Hueso            #EEF2F7  texto principal sobre oscuro
//   Pista            #586686  texto de ayuda (solo en claro: 2.7:1 sobre Superficie)
//   Azul Cielo       #2F8CFF  enlaces, información, badges
//   Nube #F6F8FB · Horizonte #DCEBFF · Azul Vuelo #0D2348 (tema claro)
//   Correcto #B4E854 · Atención #FFB547 · Error #FF7A66
// Integrado con vendra-brand-kit (docs/VENDRA_BRAND_SYSTEM.md): mismos
// nombres de clase, más utilidades nuevas para código nuevo: bg-vendra-*,
// rounded-vendra, font-display, font-ui. Variables CSS --vd-* en
// src/styles/vendra-tokens.css.
// =====================================================================
export const VENDRA = {
  voltaje:         '#B4E854',
  voltajeProfundo: '#7FB52E',
  noche:           '#0A1428',
  superficie:      '#10243F',
  hueso:           '#EEF2F7',
  pista:           '#586686',
  azulCielo:       '#2F8CFF',
  nube:            '#F6F8FB',
  horizonte:       '#DCEBFF',
  azulVuelo:       '#0D2348',
  correcto:        '#B4E854',
  atencion:        '#FFB547',
  error:           '#FF7A66',
  // Texto secundario legible sobre oscuro (7.2:1 sobre Noche; Pista no llega a 4.5:1)
  textoSecundario: '#93A4BD',
  // Tintas de estado para texto sobre claro (Voltaje/ámbar/coral nunca como texto en claro)
  okInk:           '#3F6B0F',
  warnInk:         '#8A5200',
  errorInk:        '#B02A1C',
}
const SURFACE_DARK = {
  50:  '#1E3A5F', // chips, pistas de barras, skeleton, hover sobre tarjetas
  100: '#183252',
  200: '#132A4A', // diálogos, menús, toasts
  300: VENDRA.superficie, // tarjetas, paneles, campos
  400: '#0D1D35', // pozos dentro de tarjetas (filas, controles segmentados)
  500: VENDRA.noche, // fondo de página
  600: '#070F1F',
}
const SURFACE_LIGHT = {
  50:  '#E3E9F1',
  100: '#EDF1F7',
  200: '#ffffff',
  300: '#ffffff',
  400: '#EEF2F7',
  500: VENDRA.nube,
  600: '#E8EDF4',
}
// Escala de Voltaje. 500 = Voltaje, 700 = Voltaje Profundo.
const BRAND = {
  50:  '#F5FCE8',
  100: '#E9F8CC',
  200: '#D6F29E',
  300: '#C6EE7A',
  400: VENDRA.voltaje,
  500: VENDRA.voltaje,
  600: '#9ACD3E', // hover del botón principal (texto Noche 9.8:1)
  700: VENDRA.voltajeProfundo,
  800: '#628C22',
  900: '#46651A',
}
// Verde profundo para "acento como texto" en el tema claro (6.3:1 sobre blanco)
const BRAND_INK_LIGHT = VENDRA.okInk
// Neutros VENDRA: [oscuro, claro]
const NEUTRALS = {
  100: [VENDRA.hueso, VENDRA.azulVuelo],
  200: ['#DCE3EE', '#13294F'],
  300: ['#C0CADB', '#22365C'],
  400: [VENDRA.textoSecundario, '#556274'], // texto secundario: 6.2:1 sobre Superficie · 6.2:1 sobre blanco
  500: [VENDRA.pista, '#6B7894'], // decorativo / terciario
  600: ['#45526E', '#97A2B8'],
  700: ['#33405A', '#C3CBD9'],
  800: ['#22304A', '#DCE2EB'],
  900: ['#172540', '#EBEFF5'],
}
// Estados (tema oscuro): Correcto = Voltaje, Atención, Error, Info = Azul Cielo
const STATUS_DARK = {
  green:  { 200: '#D6F29E', 300: '#C6EE7A', 400: VENDRA.correcto },
  yellow: { 200: '#FFE0B0', 300: '#FFC875', 400: VENDRA.atencion },
  amber:  { 200: '#FFE0B0', 300: '#FFC875', 400: VENDRA.atencion },
  red:    { 200: '#FFCBC2', 300: '#FF9E8F', 400: VENDRA.error },
  blue:   { 200: '#B8D8FF', 300: '#6AAEFF', 400: VENDRA.azulCielo },
}
const c = defaultColors
// token → [valor oscuro, valor claro]
const THEMED = {
  white: [VENDRA.hueso, VENDRA.azulVuelo],
  ...Object.fromEntries(Object.keys(SURFACE_LIGHT).map(k => [`surface-${k}`, [SURFACE_DARK[k], SURFACE_LIGHT[k]]])),
  ...Object.fromEntries(Object.entries(NEUTRALS).map(([k, v]) => [`gray-${k}`, v])),
  'brand-200': [BRAND[200], BRAND_INK_LIGHT],
  'brand-300': [BRAND[300], BRAND_INK_LIGHT],
  'brand-400': [BRAND[400], BRAND_INK_LIGHT],
}
const STATUS_HUES = ['red', 'green', 'yellow', 'amber', 'emerald', 'blue', 'pink', 'cyan', 'orange']
// Estados (tema claro): tintas del manual para el tono 400, el más usado como texto
const STATUS_LIGHT_400 = { green: VENDRA.okInk, yellow: VENDRA.warnInk, amber: VENDRA.warnInk, red: VENDRA.errorInk }
for (const hue of STATUS_HUES) {
  const dark = STATUS_DARK[hue] || {}
  THEMED[`${hue}-200`] = [dark[200] || c[hue][200], c[hue][950]]
  THEMED[`${hue}-300`] = [dark[300] || c[hue][300], c[hue][950]]
  THEMED[`${hue}-400`] = [dark[400] || c[hue][400], STATUS_LIGHT_400[hue] || c[hue][900]]
  THEMED[`${hue}-900`] = [c[hue][900], c[hue][100]]
}

const rgb = (hex) => {
  const n = parseInt(hex.slice(1), 16)
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`
}
const themed = (token) => `rgb(var(--pv-${token}) / <alpha-value>)`
const shades = (hue, list) => Object.fromEntries(list.map(s => [s, themed(`${hue}-${s}`)]))

const themeVars = plugin(({ addBase }) => {
  const dark = {}, light = {}
  for (const [token, [d, l]] of Object.entries(THEMED)) {
    dark[`--pv-${token}`] = rgb(d)
    light[`--pv-${token}`] = rgb(l)
  }
  addBase({
    ':root, [data-theme="dark"]': dark,
    '[data-theme="light"]': light,
  })
})

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      // Monitores de cabina/caja de 1920px+ — por encima de 2xl (1536)
      screens: {
        '3xl': '1920px',
      },
      // Ancho máximo del contenido de las vistas de datos: más allá de ~1440px
      // las filas de un dashboard se vuelven ilegibles (el ojo recorre demasiado
      // de un extremo al otro) y las barras pierden proporción.
      maxWidth: {
        content: '90rem',
      },
      // Margen lateral fluido (16px en móvil → 32px en escritorio), ver --gutter
      spacing: {
        gutter: 'var(--gutter)',
      },
      // Piso tipográfico: 11px para micro-etiquetas (badges, ejes, "label small"
      // de Material 3). Reemplaza los text-[9px]/[10px] sueltos por el código.
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],
        // Escala VENDRA
        kbd:     ['0.8125rem', { lineHeight: '1' }],               // atajos y SKU: JetBrains Mono Medium 13px
        section: ['1.375rem', { lineHeight: '1.75rem' }],          // encabezado de sección: Space Grotesk SemiBold 22px
        screen:  ['2.25rem', { lineHeight: '2.5rem' }],            // título de pantalla: Space Grotesk Bold 36px
        total:   ['3rem', { lineHeight: '1' }],                    // totales del POS: JetBrains Mono Bold 48px
      },
      // Radio único de 8px: los contenedores que usaban xl/2xl/3xl quedan en 8px
      borderRadius: {
        vendra: '8px',
        md:    '0.5rem',
        xl:    '0.5rem',
        '2xl': '0.5rem',
        '3xl': '0.5rem',
      },
      // Diseño plano: sin sombras (bordes de 1px en su lugar)
      boxShadow: {
        sm: '0 0 #0000', DEFAULT: '0 0 #0000', md: '0 0 #0000', lg: '0 0 #0000',
        xl: '0 0 #0000', '2xl': '0 0 #0000', inner: '0 0 #0000',
      },
      // border-white/8 se usaba en varias cards sin existir en la escala por
      // defecto (no generaba CSS); ahora sí es un paso válido.
      opacity: {
        8: '0.08',
      },
      colors: {
        // Métodos de pago: mismos valores que usan los gráficos (chartTheme.js)
        pay: PAY_COLORS,
        white: themed('white'),
        gray: shades('gray', [100, 200, 300, 400, 500, 600, 700, 800, 900]),
        brand: { ...BRAND, ...shades('brand', [200, 300, 400]) },
        // Nombres explícitos de marca para código nuevo (vendra-brand-kit)
        vendra: {
          voltaje:   VENDRA.voltaje,
          profundo:  VENDRA.voltajeProfundo,
          noche:     VENDRA.noche,
          superficie: VENDRA.superficie,
          hueso:     VENDRA.hueso,
          pista:     VENDRA.pista,
          muted:     VENDRA.textoSecundario,
          cielo:     VENDRA.azulCielo,
          nube:      VENDRA.nube,
          horizonte: VENDRA.horizonte,
          vuelo:     VENDRA.azulVuelo,
          ok:        VENDRA.correcto,
          warn:      VENDRA.atencion,
          error:     VENDRA.error,
          'ok-ink':    VENDRA.okInk,
          'warn-ink':  VENDRA.warnInk,
          'error-ink': VENDRA.errorInk,
        },
        // Tokens con nombre de marca (valores fijos, iguales en los dos temas)
        voltaje:    { DEFAULT: VENDRA.voltaje, profundo: VENDRA.voltajeProfundo },
        noche:      VENDRA.noche,
        superficie: VENDRA.superficie,
        hueso:      VENDRA.hueso,
        pista:      VENDRA.pista,
        cielo:      VENDRA.azulCielo,
        nube:       VENDRA.nube,
        horizonte:  VENDRA.horizonte,
        vuelo:      VENDRA.azulVuelo,
        surface: {
          ...shades('surface', [50, 100, 200, 300, 400, 500, 600]),
          // Tinta sobre Voltaje (text-surface-700 en botones y badges de marca):
          // Noche, igual en los dos temas.
          700: VENDRA.noche,
        },
        ...Object.fromEntries(STATUS_HUES.map(hue => [hue, shades(hue, [200, 300, 400, 900])])),
      },
      fontFamily: {
        // Marca y títulos · interfaz y cuerpo · montos, SKU y atajos
        display: ['"Space Grotesk"', 'Arial', 'sans-serif'],
        ui:      ['Figtree', '"Segoe UI"', 'system-ui', 'sans-serif'],
        sans:    ['Figtree', '"Segoe UI"', 'system-ui', 'sans-serif'],
        mono:    ['"JetBrains Mono"', 'Consolas', 'ui-monospace', 'monospace'],
        // Alias heredados: código anterior a la migración sigue funcionando
        syne:    ['"Space Grotesk"', 'Arial', 'sans-serif'],
        dm:      ['Figtree', '"Segoe UI"', 'system-ui', 'sans-serif'],
      },
      animation: {
        'fade-in':    'fadeIn 0.2s ease-out',
        // Sin rebote: cubic-bezier(...,1.275) hacía overshoot (pasa de 1 y
        // vuelve). ease-out-quart entra limpio, sin elástico.
        'scale-in':   'scaleIn 0.22s cubic-bezier(0.25, 1, 0.5, 1)',
        'slide-up':   'slideUp 0.25s ease-out',
        'slide-left': 'slideLeft 0.25s ease-out',
        'pulse-glow': 'pulseGlow 2s ease-in-out infinite',
      },
      keyframes: {
        fadeIn:    { from: { opacity: '0' }, to: { opacity: '1' } },
        // 0.96 → 1 en vez de 0.5 → 1: una aparición sutil de panel, no un zoom dramático
        scaleIn:   { from: { opacity: '0', transform: 'scale(0.96)' }, to: { opacity: '1', transform: 'scale(1)' } },
        slideUp:   { from: { opacity: '0', transform: 'translateY(12px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        slideLeft: { from: { opacity: '0', transform: 'translateX(12px)' }, to: { opacity: '1', transform: 'translateX(0)' } },
        // Sin sombras: el código recién generado "late" con el borde en Voltaje
        pulseGlow: {
          '0%, 100%': { borderColor: 'rgb(180 232 84 / 1)' },
          '50%':      { borderColor: 'rgb(180 232 84 / 0.35)' },
        }
      }
    }
  },
  plugins: [themeVars]
}
