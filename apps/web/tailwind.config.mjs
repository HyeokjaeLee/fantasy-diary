/** @type {import('tailwindcss').Config} */
const config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        'noto-sans-kr': ['var(--font-noto-sans-kr)', 'sans-serif'],
      },
      colors: {
        black: '#000000',
        white: '#ffffff',
      },
      boxShadow: {
        glow: '0 0 0 1px rgba(15, 17, 21, 0.08), 0 20px 60px rgba(15, 17, 21, 0.12)',
      },
    },
  },
  plugins: [],
};

export default config;
