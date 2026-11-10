/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        indigo: {
          50: 'var(--theme-50)',
          100: 'var(--theme-100)',
          200: 'var(--theme-200)',
          300: 'var(--theme-300)',
          400: 'var(--theme-400)',
          500: 'var(--theme-500)',
          600: 'var(--theme-600)',
          700: 'var(--theme-700)',
          800: 'var(--theme-800)',
          900: 'var(--theme-900)',
        }
      },
      fontFamily: {
        sans: ['Plus Jakarta Sans', 'sans-serif'],
      },
      keyframes: {
        'fade-in':  { from: { opacity: '0' }, to: { opacity: '1' } },
        'slide-up': {
          '0%': { opacity: '0', transform: 'translateY(24px)' },
          '99%': { opacity: '1', transform: 'translateY(0)' },
          '100%': { opacity: '1', transform: 'none' },
        },
        'scale-in': {
          '0%': { opacity: '0', transform: 'scale(0.92)' },
          '99%': { opacity: '1', transform: 'scale(1)' },
          '100%': { opacity: '1', transform: 'none' },
        },
        'scale-up': {
          '0%': { opacity: '0', transform: 'scale(0.94)' },
          '99%': { opacity: '1', transform: 'scale(1)' },
          '100%': { opacity: '1', transform: 'none' },
        },
      },
      animation: {
        'fade-in':  'fade-in 0.35s cubic-bezier(0.16, 1, 0.3, 1) both',
        'slide-up': 'slide-up 0.4s cubic-bezier(0.16, 1, 0.3, 1) both',
        'scale-in': 'scale-in 0.25s cubic-bezier(0.16, 1, 0.3, 1) both',
        'scale-up': 'scale-up 0.25s cubic-bezier(0.16, 1, 0.3, 1) both',
      },
    },
  },
  plugins: [],
}
