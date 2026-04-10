import { linearTheme } from './linearTheme';

/** Apply an alpha channel to a hex color: `withAlpha('#5E6AD2', 0.1)` → `'rgba(94, 106, 210, 0.1)'` */
export function withAlpha(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Pre-computed error color opacity variants. */
export const errorAlpha = {
  '8': withAlpha(linearTheme.colors.error, 0.08),
  '10': withAlpha(linearTheme.colors.error, 0.1),
  '15': withAlpha(linearTheme.colors.error, 0.15),
  '20': withAlpha(linearTheme.colors.error, 0.2),
  '30': withAlpha(linearTheme.colors.error, 0.3),
  '40': withAlpha(linearTheme.colors.error, 0.4),
} as const;

/** Pre-computed success color opacity variants. */
export const successAlpha = {
  '8': withAlpha(linearTheme.colors.success, 0.08),
  '10': withAlpha(linearTheme.colors.success, 0.1),
  '15': withAlpha(linearTheme.colors.success, 0.15),
  '20': withAlpha(linearTheme.colors.success, 0.2),
} as const;

/** Pre-computed warning color opacity variants. */
export const warningAlpha = {
  '8': withAlpha(linearTheme.colors.warning, 0.08),
  '10': withAlpha(linearTheme.colors.warning, 0.1),
  '12': withAlpha(linearTheme.colors.warning, 0.12),
  '14': withAlpha(linearTheme.colors.warning, 0.14),
  '15': withAlpha(linearTheme.colors.warning, 0.15),
  '18': withAlpha(linearTheme.colors.warning, 0.18),
  '20': withAlpha(linearTheme.colors.warning, 0.2),
  '35': withAlpha(linearTheme.colors.warning, 0.35),
} as const;

/** Pre-computed accent color opacity variants (avoids repeated `withAlpha` calls in hot paths). */
export const accentAlpha = {
  '4': withAlpha(linearTheme.colors.accent, 0.04),
  '5': withAlpha(linearTheme.colors.accent, 0.05),
  '6': withAlpha(linearTheme.colors.accent, 0.06),
  '8': withAlpha(linearTheme.colors.accent, 0.08),
  '10': withAlpha(linearTheme.colors.accent, 0.1),
  '14': withAlpha(linearTheme.colors.accent, 0.14),
  '15': withAlpha(linearTheme.colors.accent, 0.15),
  '18': withAlpha(linearTheme.colors.accent, 0.18),
  '20': withAlpha(linearTheme.colors.accent, 0.2),
  '25': withAlpha(linearTheme.colors.accent, 0.25),
  '30': withAlpha(linearTheme.colors.accent, 0.3),
  '35': withAlpha(linearTheme.colors.accent, 0.35),
  '50': withAlpha(linearTheme.colors.accent, 0.5),
} as const;

/** Pre-computed white opacity variants. */
export const whiteAlpha = {
  '1.5': 'rgba(255, 255, 255, 0.015)',
  '2': 'rgba(255, 255, 255, 0.02)',
  '2.5': 'rgba(255, 255, 255, 0.025)',
  '3': 'rgba(255, 255, 255, 0.03)',
  '4': 'rgba(255, 255, 255, 0.04)',
  '5': 'rgba(255, 255, 255, 0.05)',
  '6': 'rgba(255, 255, 255, 0.06)',
  '8': 'rgba(255, 255, 255, 0.08)',
  '10': 'rgba(255, 255, 255, 0.1)',
  '12': 'rgba(255, 255, 255, 0.12)',
  '14': 'rgba(255, 255, 255, 0.14)',
  '15': 'rgba(255, 255, 255, 0.15)',
  '20': 'rgba(255, 255, 255, 0.2)',
  '25': 'rgba(255, 255, 255, 0.25)',
  '30': 'rgba(255, 255, 255, 0.3)',
  '40': 'rgba(255, 255, 255, 0.4)',
  '50': 'rgba(255, 255, 255, 0.5)',
  '60': 'rgba(255, 255, 255, 0.6)',
  '70': 'rgba(255, 255, 255, 0.7)',
  '80': 'rgba(255, 255, 255, 0.8)',
  '90': 'rgba(255, 255, 255, 0.9)',
} as const;

/** Pre-computed black opacity variants. */
export const blackAlpha = {
  '5': 'rgba(0, 0, 0, 0.05)',
  '10': 'rgba(0, 0, 0, 0.1)',
  '15': 'rgba(0, 0, 0, 0.15)',
  '20': 'rgba(0, 0, 0, 0.2)',
  '30': 'rgba(0, 0, 0, 0.3)',
  '40': 'rgba(0, 0, 0, 0.4)',
  '45': 'rgba(0, 0, 0, 0.45)',
  '50': 'rgba(0, 0, 0, 0.5)',
  '52': 'rgba(0, 0, 0, 0.52)',
  '56': 'rgba(0, 0, 0, 0.56)',
  '60': 'rgba(0, 0, 0, 0.6)',
  '70': 'rgba(0, 0, 0, 0.7)',
  '72': 'rgba(0, 0, 0, 0.72)',
  '80': 'rgba(0, 0, 0, 0.8)',
  '82': 'rgba(0, 0, 0, 0.82)',
  '85': 'rgba(0, 0, 0, 0.85)',
  '92': 'rgba(0, 0, 0, 0.92)',
} as const;

/**
 * Informational blue — distinct from the purple `accent`.
 * Used for transcript / audio / capture surfaces (ContentCard, TranscriptVault, etc.).
 */
export const TRANSCRIPT_BLUE = '#6D99FF';
export const TRANSCRIPT_BLUE_BORDER = '#82AAFF';

/** Pre-computed transcript-blue opacity variants (fill). */
export const transcriptBlueAlpha = {
  '10': withAlpha(TRANSCRIPT_BLUE, 0.1),
  '12': withAlpha(TRANSCRIPT_BLUE, 0.12),
  '14': withAlpha(TRANSCRIPT_BLUE, 0.14),
  '35': withAlpha(TRANSCRIPT_BLUE, 0.35),
} as const;

/** Pre-computed transcript-blue border opacity variants. */
export const transcriptBlueBorderAlpha = {
  '20': withAlpha(TRANSCRIPT_BLUE_BORDER, 0.2),
  '24': withAlpha(TRANSCRIPT_BLUE_BORDER, 0.24),
  '35': withAlpha(TRANSCRIPT_BLUE_BORDER, 0.35),
} as const;
