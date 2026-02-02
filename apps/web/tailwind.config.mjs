/** @type {import('tailwindcss').Config} */
const config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          950: '#0f1115',
          900: '#171a21',
          800: '#1f2430',
          700: '#2b3242',
        },
        parchment: {
          50: '#fcfaf6',
          100: '#f6f1e8',
          200: '#ebe2d2',
          300: '#ddcfb7',
        },
        ember: {
          500: '#c46a39',
          600: '#a9562b',
        },
        moss: {
          500: '#5a7b6a',
          600: '#486456',
        },
      },
      boxShadow: {
        glow: '0 0 0 1px rgba(15, 17, 21, 0.08), 0 20px 60px rgba(15, 17, 21, 0.12)',
      },
    },
  },
  plugins: [],
};

export default config;
