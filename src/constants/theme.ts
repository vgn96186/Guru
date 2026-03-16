import { spacing } from './spacing';
import { radius } from './radius';
import { shadows } from './shadows';

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
    divider: '#1E1E2A',

    // Semantic surfaces
    panel: '#171722',
    panelAlt: '#15151E',
    inputBg: '#13131E',
    overlay: 'rgba(6, 8, 14, 0.72)',
    backdropStrong: 'rgba(0, 0, 0, 0.82)',
    successSurface: '#1A2A1A',
    warningSurface: '#2A1A0A',
    errorSurface: '#2A1A1A',
    primaryTint: '#25205A',
    primaryTintSoft: '#6C63FF22',
    primaryTintMedium: '#6C63FF44',
    warningTintSoft: '#FF980022',
    errorTintSoft: '#F4433622',
    successTintSoft: '#4CAF5022',

    // Status
    unseen: '#606080',
    seen: '#2196F3',
    reviewed: '#FF9800',
    mastered: '#4CAF50',
  },
  alpha: {
    pressed: 0.88,
    subtlePressed: 0.94,
  },

  spacing,
  radius,
  shadows,
  borderRadius: radius, // For backward compatibility temporarily

  typography: {
    headline: { fontSize: 28, fontWeight: '900' as const, letterSpacing: -0.5 },
    title: { fontSize: 22, fontWeight: '800' as const, letterSpacing: -0.25 },
    subtitle: { fontSize: 18, fontWeight: '700' as const },
    body: { fontSize: 16, fontWeight: '400' as const, lineHeight: 24 },
    caption: { fontSize: 13, fontWeight: '400' as const, color: '#8080A0' },
    sectionLabel: {
      fontSize: 12,
      fontWeight: '800' as const,
      letterSpacing: 1.5,
      textTransform: 'uppercase' as const,
      color: '#8080A0'
    },
    button: { fontSize: 16, fontWeight: '700' as const },

    // Legacy (keep for compatibility while transitioning)
    h1: { fontSize: 26, fontWeight: '900' as const },
    h2: { fontSize: 22, fontWeight: '800' as const },
    h3: { fontSize: 18, fontWeight: '700' as const },
    h4: { fontSize: 16, fontWeight: '700' as const },
    bodySmall: { fontSize: 14, fontWeight: '400' as const },
    label: { fontSize: 13, fontWeight: '600' as const },
  },

} as const;

export type ThemeColors = typeof theme.colors;
export type ThemeSpacing = typeof theme.spacing;
