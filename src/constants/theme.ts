/**
 * Guru — Centralized Design System
 *
 * All screens should import from this file rather than hardcoding hex values,
 * magic numbers, or inline font sizes. Migrate screens incrementally.
 *
 * Migration order (highest-traffic first):
 *   HomeScreen → SettingsScreen → StatsScreen → SessionScreen → SyllabusScreen
 */

export const theme = {
  colors: {
    // Backgrounds — Modern & Minimal with better contrast
    background: '#0A0A0F',
    surface: '#151520',
    surfaceAlt: '#0E0E14',
    card: '#1A1A24',
    cardHover: '#22222E',

    // Brand — Refined accent colors
    primary: '#7C73FF',
    primaryLight: '#9B94FF',
    primaryDark: '#5A52D5',
    accent: '#FF6B9D',
    accentAlt: '#FFD700',

    // Semantic
    success: '#52D273',
    warning: '#FFA500',
    error: '#FF5252',
    info: '#2196F3',

    // Text — Enhanced for accessibility (WCAG AA)
    textPrimary: '#F8F8FB',
    textSecondary: '#C2C2D6',
    textMuted: '#888899',
    textInverse: '#0A0A0F',

    // Borders — More defined for hierarchy
    border: '#262633',
    borderLight: '#3A3A47',
    divider: '#1E1E2A',

    // Semantic surfaces
    panel: '#131318',
    panelAlt: '#0F0F14',
    inputBg: '#10101A',
    overlay: 'rgba(10, 10, 15, 0.8)',
    backdropStrong: 'rgba(0, 0, 0, 0.88)',
    successSurface: '#0F2E1A',
    warningSurface: '#2D1F0A',
    errorSurface: '#2D1515',
    primaryTint: '#2A2456',
    primaryTintSoft: '#7C73FF15',
    primaryTintMedium: '#7C73FF35',
    warningTintSoft: '#FFA50015',
    errorTintSoft: '#FF525215',
    successTintSoft: '#52D27315',

    // Status
    unseen: '#6A7A95',
    seen: '#2196F3',
    reviewed: '#FFA500',
    mastered: '#52D273',
  },
  alpha: {
    pressed: 0.88,
    subtlePressed: 0.94,
  },

  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 24,
    xxl: 32,
    xxxl: 48,
  },

  typography: {
    // Modern hierarchy: Display, Heading1-2, Body, Caption
    h0: { fontSize: 32, fontWeight: '700' as const, lineHeight: 40 },
    h1: { fontSize: 28, fontWeight: '700' as const, lineHeight: 36 },
    h2: { fontSize: 24, fontWeight: '600' as const, lineHeight: 32 },
    h3: { fontSize: 20, fontWeight: '600' as const, lineHeight: 28 },
    h4: { fontSize: 16, fontWeight: '600' as const, lineHeight: 24 },
    body: { fontSize: 16, fontWeight: '400' as const, lineHeight: 24 },
    bodySmall: { fontSize: 14, fontWeight: '400' as const, lineHeight: 20 },
    caption: { fontSize: 12, fontWeight: '500' as const, lineHeight: 18 },
    captionSmall: { fontSize: 11, fontWeight: '500' as const, lineHeight: 16 },
    label: { fontSize: 13, fontWeight: '600' as const, lineHeight: 18 },
    button: { fontSize: 16, fontWeight: '700' as const, lineHeight: 20 },
  },

  borderRadius: {
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    xxl: 28,
    full: 999,
  },

  shadows: {
    sm: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.25,
      shadowRadius: 4,
      elevation: 2,
    },
    md: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 8,
      elevation: 4,
    },
    lg: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.35,
      shadowRadius: 12,
      elevation: 6,
    },
    glow: (color: string) => ({
      shadowColor: color,
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.5,
      shadowRadius: 16,
      elevation: 8,
    }),
  },

  // Animation durations for consistent transitions
  animations: {
    quick: 150,
    standard: 300,
    slow: 500,
  },

  /** Minimum touch target size (Android Material: 48dp, Apple HIG: 44pt) */
  hitSlop: { top: 12, bottom: 12, left: 12, right: 12 },
  minTouchSize: 48,
} as const;

export type ThemeColors = typeof theme.colors;
export type ThemeSpacing = typeof theme.spacing;
