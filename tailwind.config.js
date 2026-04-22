/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./App.{js,jsx,ts,tsx}', './src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        brand: {
          500: '#5E6AD2',
          600: '#4A55A6',
        },
        dark: {
          bg: '#000000',
          card: '#0a0a0c',
          border: 'rgba(255, 255, 255, 0.08)',
          hover: 'rgba(255, 255, 255, 0.05)',
          active: 'rgba(255, 255, 255, 0.08)',
          text: {
            primary: '#E8E8E8',
            secondary: '#8A8F98',
            muted: '#5E626B',
          },
        },
      },
    },
  },
  plugins: [],
};
