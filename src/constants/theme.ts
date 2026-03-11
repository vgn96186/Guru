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
    // Backgrounds
    background: '#0F0F14',
    surface: '#1A1A24',
    surfaceAlt: '#13131A',
    card: '#1E1E2E',
    cardHover: '#252535',

    // Brand
    primary: '#6C63FF',
    primaryLight: '#8B85FF',
    primaryDark: '#4A43CC',
    accent: '#FF6B9D',
    accentAlt: '#FFD700',

    // Semantic
    success: '#4CAF50',
    warning: '#FF9800',
    error: '#F44336',
    info: '#2196F3',

    // Text
    textPrimary: '#FFFFFF',
    textSecondary: '#B8B8D0',
    textMuted: '#8080A0',
    textInverse: '#0F0F14',

    // Borders
    border: '#2A2A3C',
    borderLight: '#3A3A4C',

    // Status
    unseen: '#606080',
    seen: '#2196F3',
    reviewed: '#FF9800',
    mastered: '#4CAF50',
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
    h1: { fontSize: 26, fontWeight: '900' as const },
    h2: { fontSize: 22, fontWeight: '800' as const },
    h3: { fontSize: 18, fontWeight: '700' as const },
    h4: { fontSize: 16, fontWeight: '700' as const },
    body: { fontSize: 15, fontWeight: '400' as const },
    bodySmall: { fontSize: 14, fontWeight: '400' as const },
    caption: { fontSize: 12, fontWeight: '400' as const },
    label: { fontSize: 13, fontWeight: '600' as const },
    button: { fontSize: 16, fontWeight: '700' as const },
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
      shadowOpacity: 0.3,
      shadowRadius: 4,
      elevation: 3,
    },
    md: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.4,
      shadowRadius: 8,
      elevation: 6,
    },
    glow: (color: string) => ({
      shadowColor: color,
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.6,
      shadowRadius: 12,
      elevation: 8,
    }),
  },
} as const;

export type ThemeColors = typeof theme.colors;
export type ThemeSpacing = typeof theme.spacing;
