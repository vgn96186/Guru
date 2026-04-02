export const linearTheme = {
  colors: {
    // Structural
    background: '#000000', // True black for the base
    surface: '#050505',    // Near-true-black cards
    surfaceHover: '#0A0A0A',
    card: '#070707',
    cardHover: '#0C0C0C',
    border: 'rgba(255, 255, 255, 0.08)', // The secret to the look
    borderHighlight: 'rgba(255, 255, 255, 0.12)', // For top edges

    // Gradients (using opacity steps against the #111111 surface)
    surfaceGradientStart: 'rgba(255, 255, 255, 0.04)',
    surfaceGradientMid: 'rgba(255, 255, 255, 0.01)',
    surfaceGradientEnd: 'transparent',

    // Text
    textPrimary: '#F2F2F2',
    textSecondary: '#A0A0A5',
    textMuted: '#8A8A8E',
    textInverse: '#000000',

    // Accents & States
    accent: '#5E6AD2', // Linear's signature purple/blue
    success: '#3FB950',
    warning: '#D97706',
    error: '#F14C4C',
    successSurface: 'rgba(63, 185, 80, 0.1)',
    errorSurface: 'rgba(241, 76, 76, 0.1)',
    borderLight: 'rgba(255, 255, 255, 0.15)',
    primaryTintSoft: 'rgba(94, 106, 210, 0.1)',
  },

  spacing: {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
  },

  radius: {
    sm: 8,
    md: 12,
    lg: 16,
    full: 999,
  },

  alpha: {
    pressed: 0.88,
    disabled: 0.55,
  },

  typography: {
    display: { fontSize: 28, lineHeight: 34, fontFamily: 'Inter_900Black' },
    title: { fontSize: 24, lineHeight: 30, fontFamily: 'Inter_800ExtraBold' },
    sectionTitle: { fontSize: 18, lineHeight: 24, fontFamily: 'Inter_700Bold' },
    body: { fontSize: 15, lineHeight: 22, fontFamily: 'Inter_400Regular' },
    bodySmall: { fontSize: 14, lineHeight: 20, fontFamily: 'Inter_400Regular' },
    label: { fontSize: 13, lineHeight: 18, fontFamily: 'Inter_600SemiBold' },
    caption: { fontSize: 12, lineHeight: 18, fontFamily: 'Inter_500Medium' },
    chip: { fontSize: 12, lineHeight: 18, fontFamily: 'Inter_700Bold' },
    badge: { fontSize: 12, lineHeight: 18, fontFamily: 'Inter_700Bold' },
    meta: { fontSize: 12, lineHeight: 16, fontFamily: 'Inter_500Medium' },
    button: { fontSize: 14, lineHeight: 18, fontFamily: 'Inter_700Bold' },
  },
} as const;

export type LinearTheme = typeof linearTheme;
