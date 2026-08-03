/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
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
        },
        surface: {
          50:  '#2a2a2a',
          100: '#222222',
          200: '#1e1e1e',
          300: '#1a1a1a',
          400: '#161616',
          500: '#111111',
          600: '#0d0d0d',
          700: '#0a0a0a',
        }
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
  plugins: []
}
