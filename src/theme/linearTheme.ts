export const linearTheme = {
  colors: {
    // Structural — opaque on true black. Alpha on #000 bought nothing and
    // forced composite math; these are the rgb equivalents.
    background: '#000000',
    surface: '#05070C',
    surfaceHover: '#080A10',
    card: '#090C12',
    cardHover: '#0D1018',
    border: 'rgba(255, 255, 255, 0.08)',
    borderHighlight: 'rgba(255, 255, 255, 0.18)',

    // Gradients tuned toward darker black glass, similar to the Action Hub sheet.
    surfaceGradientStart: 'rgba(255, 255, 255, 0.05)',
    surfaceGradientMid: 'rgba(255, 255, 255, 0.012)',
    surfaceGradientEnd: 'transparent',
    surfaceInset: 'rgba(255, 255, 255, 0.008)',
    surfaceTint: 'rgba(94, 106, 210, 0.055)',

    // Text
    textPrimary: '#F2F2F2',
    textSecondary: '#A0A0A5',
    /** Slightly lifted vs legacy #8A8A8E for ~4.5:1 on e1 card surfaces. */
    textMuted: '#939396',
    textInverse: '#000000',

    // Accents & States
    accent: '#5E6AD2', // Linear's signature purple/blue
    success: '#3FB950',
    warning: '#D97706',
    error: '#F14C4C',
    successSurface: 'rgba(63, 185, 80, 0.1)',
    errorSurface: 'rgba(241, 76, 76, 0.1)',
    borderLight: 'rgba(255, 255, 255, 0.15)',
    primaryTintSoft: 'rgba(22, 29, 54, 0.9)',

    // --- Semantic role palette (patch 02) ---
    // Roles, not colors. If a component wants a named color, it should pick a
    // role from this list. The hex values below are the ONLY accents allowed
    // in new code; anything else must earn its way in.
    //
    //   brand   — primary CTA, focus ring, selected tab
    //   capture — audio / transcript / recording surfaces (replaces TRANSCRIPT_BLUE)
    //   success — streak hit, mastered, completed
    //   warning — countdown < 60d, mild error, soft lockout
    //   danger  — destructive, revoke, hard error
    //   neutral — everything else (greys)
    roles: {
      brand: '#5E6AD2',
      brandHi: 'oklch(62% 0.14 272)',
      brandLo: 'oklch(46% 0.12 272)',
      capture: '#6D99FF',
      success: '#3FB950',
      warning: '#D97706',
      danger: '#F14C4C',
      neutral: '#A0A0A5',
    },
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
    display: { fontSize: 32, lineHeight: 36, fontFamily: 'Inter_700Bold', letterSpacing: -0.6 },
    title: { fontSize: 22, lineHeight: 28, fontFamily: 'Inter_600SemiBold', letterSpacing: -0.3 },
    sectionTitle: {
      fontSize: 16,
      lineHeight: 22,
      fontFamily: 'Inter_600SemiBold',
      letterSpacing: -0.1,
    },
    body: { fontSize: 15, lineHeight: 22, fontFamily: 'Inter_400Regular' },
    bodySmall: { fontSize: 13, lineHeight: 20, fontFamily: 'Inter_400Regular' },
    label: { fontSize: 12, lineHeight: 18, fontFamily: 'Inter_500Medium', letterSpacing: 0.4 },
    caption: { fontSize: 12, lineHeight: 18, fontFamily: 'Inter_400Regular' },
    chip: { fontSize: 12, lineHeight: 16, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.2 },
    badge: { fontSize: 11, lineHeight: 14, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.3 },
    meta: { fontSize: 12, lineHeight: 16, fontFamily: 'Inter_500Medium' },
    button: { fontSize: 14, lineHeight: 18, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.1 },
  },
} as const;

export type LinearRole = keyof typeof linearTheme.colors.roles;
export type LinearTheme = typeof linearTheme;
