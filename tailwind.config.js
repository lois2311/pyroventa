import defaultColors from 'tailwindcss/colors.js'
import plugin from 'tailwindcss/plugin.js'
import { PAY_COLORS } from './src/lib/chartTheme.js'

// =====================================================================
// Temas: oscuro (por defecto) y claro de alto contraste
// ---------------------------------------------------------------------
// Las clases siguen siendo las de siempre (text-white, bg-surface-300,
// text-red-400…), pero los tokens que cambian de un tema a otro apuntan a
// variables CSS (--pv-*). En :root valen lo mismo que antes (el tema oscuro
// no cambia); con <html data-theme="light"> se remapean:
//   - superficies: fondo gris claro, tarjetas y diálogos blancos;
//   - "white" (texto principal, bordes y velos con opacidad) → casi negro;
//   - grises de texto invertidos y un paso más oscuros (≥7:1 sobre blanco);
//   - tonos 300/400 de estado, pensados para leerse sobre negro → 900/950;
//   - tonos 900 usados como fondo tintado oscuro → 100.
// Un subárbol con data-theme="dark" vuelve a los valores oscuros (p. ej. la
// vista previa del recibo, que es papel blanco con tinta gris a propósito).
// =====================================================================
const SURFACE_DARK = {
  50:  '#2a2a2a',
  100: '#222222',
  200: '#1e1e1e',
  300: '#1a1a1a',
  400: '#161616',
  500: '#111111',
  600: '#0d0d0d',
}
const SURFACE_LIGHT = {
  50:  '#e4e4e7', // chips, pistas de barras, skeleton, hover sobre tarjetas
  100: '#efeff1',
  200: '#ffffff', // diálogos, menús, toasts
  300: '#ffffff', // tarjetas, paneles, campos
  400: '#f4f4f5', // pozos dentro de tarjetas (filas, controles segmentados)
  500: '#e9e9ec', // fondo de página
  600: '#e2e2e6',
}
const BRAND = {
  50:  '#fff7ed',
  100: '#ffedd5',
  200: '#fed7aa',
  300: '#fdba74',
  400: '#fb923c',
  500: '#f97316',
  600: '#ea580c',
  700: '#c2410c',
  800: '#9a3412',
  900: '#7c2d12',
}
const c = defaultColors
// token → [valor oscuro, valor claro]
const THEMED = {
  white: ['#ffffff', c.gray[900]],
  ...Object.fromEntries(Object.keys(SURFACE_LIGHT).map(k => [`surface-${k}`, [SURFACE_DARK[k], SURFACE_LIGHT[k]]])),
  'gray-100': [c.gray[100], c.gray[950]],
  'gray-200': [c.gray[200], c.gray[900]],
  'gray-300': [c.gray[300], c.gray[800]],
  'gray-400': [c.gray[400], c.gray[700]],
  'gray-500': [c.gray[500], c.gray[600]],
  'gray-600': [c.gray[600], c.gray[400]],
  'gray-700': [c.gray[700], c.gray[300]],
  'gray-800': [c.gray[800], c.gray[200]],
  'gray-900': [c.gray[900], c.gray[100]],
  'brand-200': [BRAND[200], BRAND[900]],
  'brand-300': [BRAND[300], BRAND[900]],
  'brand-400': [BRAND[400], BRAND[900]], // 7.7:1 sobre el fondo de página
}
const STATUS_HUES = ['red', 'green', 'yellow', 'amber', 'emerald', 'blue', 'pink', 'cyan', 'orange']
for (const hue of STATUS_HUES) {
  THEMED[`${hue}-200`] = [c[hue][200], c[hue][950]]
  THEMED[`${hue}-300`] = [c[hue][300], c[hue][950]]
  THEMED[`${hue}-400`] = [c[hue][400], c[hue][900]]
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
        surface: {
          ...shades('surface', [50, 100, 200, 300, 400, 500, 600]),
          // Tinta sobre naranja (text-surface-700 en botones y badges de marca):
          // igual en los dos temas.
          700: '#0a0a0a',
        },
        ...Object.fromEntries(STATUS_HUES.map(hue => [hue, shades(hue, [200, 300, 400, 900])])),
      },
      fontFamily: {
        syne: ['Syne', 'sans-serif'],
        dm:   ['DM Sans', 'sans-serif'],
        mono: ['DM Mono', 'monospace'],
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
        pulseGlow: {
          '0%, 100%': { boxShadow: '0 0 10px rgba(249,115,22,0.4), 0 0 20px rgba(249,115,22,0.2)' },
          '50%':      { boxShadow: '0 0 20px rgba(249,115,22,0.7), 0 0 40px rgba(249,115,22,0.4)' },
        }
      }
    }
  },
  plugins: [themeVars]
}
