/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./App.{js,jsx,ts,tsx}', './src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        // Base
        background: '#050506',
        surface: '#0B0B0E',
        surfaceElevated: '#121217',
        surfaceHover: '#0C0E16',
        card: '#0B0B0E',
        cardHover: '#0C0E16',
        bentoCard: '#1A1B22',
        tile: '#090B12',
        tileDark: '#06080C',
        tileHover: '#0C0E16',
        iconBg: '#0C0E16',
        // Borders
        border: 'rgba(255, 255, 255, 0.14)',
        borderStrong: 'rgba(255, 255, 255, 0.28)',
        borderHighlight: 'rgba(255, 255, 255, 0.14)',
        borderLight: 'rgba(255, 255, 255, 0.15)',
        // Text
        textPrimary: '#FAFAFA',
        textSecondary: '#B8B8BD',
        textMuted: '#7A7A80',
        textInverse: '#000000',
        // Accents
        accent: '#5E6AD2',
        accentGlow: 'rgba(94, 106, 210, 0.35)',
        accentSurface: 'rgba(94, 106, 210, 0.08)',
        accentBorder: 'rgba(94, 106, 210, 0.45)',
        // States
        success: '#3FB950',
        warning: '#D97706',
        error: '#F14C4C',
        successSurface: 'rgba(63, 185, 80, 0.1)',
        errorSurface: 'rgba(241, 76, 76, 0.1)',
        // Glass
        glassTintStart: 'rgba(255, 255, 255, 0.06)',
        glassTintEnd: 'rgba(255, 255, 255, 0.00)',
        glassPurpleStart: 'rgba(94, 106, 210, 0.18)',
        glassPurpleEnd: 'rgba(94, 106, 210, 0.00)',
        // Surface gradients
        surfaceGradientStart: 'rgba(255, 255, 255, 0.03)',
        surfaceGradientMid: 'rgba(255, 255, 255, 0.008)',
        surfaceGradientEnd: 'rgba(0, 0, 0, 0.0)',
        surfaceInset: 'rgba(255, 255, 255, 0.015)',
        surfaceTint: 'rgba(255, 255, 255, 0.01)',
        // Legacy dark tokens (for backward compat during migration)
        dark: {
          bg: '#050506',
          card: '#0B0B0E',
          border: 'rgba(255, 255, 255, 0.14)',
          hover: '#0C0E16',
          active: '#0C0E16',
          text: {
            primary: '#FAFAFA',
            secondary: '#B8B8BD',
            muted: '#7A7A80',
          },
        },
      },
      spacing: {
        '2xl': 48,
      },
      borderRadius: {
        'xl': 20,
      },
    },
  },
  plugins: [],
};
