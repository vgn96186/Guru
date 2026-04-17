#!/usr/bin/env tsx
/**
 * Build Tailwind config from linearTheme.ts
 * Run via: npm run theme:sync
 */

import fs from 'fs';
import path from 'path';
import { linearTheme } from '../src/theme/linearTheme';

function generateTailwindConfig() {
  const config = {
    content: [
      './App.tsx',
      './index.ts',
      './src/**/*.{ts,tsx}',
      './modules/**/*.{ts,tsx}',
    ],
    theme: {
      extend: {
        colors: {
          // Base - hi-contrast mono
          background: linearTheme.colors.background,
          surface: linearTheme.colors.surface,
          'surface-elevated': linearTheme.colors.surfaceElevated,
          'surface-hover': linearTheme.colors.surfaceHover,
          card: linearTheme.colors.card,
          'card-hover': linearTheme.colors.cardHover,
          border: linearTheme.colors.border,
          'border-strong': linearTheme.colors.borderStrong,
          'border-highlight': linearTheme.colors.borderHighlight,
          // Gradients
          'surface-gradient-start': linearTheme.colors.surfaceGradientStart,
          'surface-gradient-mid': linearTheme.colors.surfaceGradientMid,
          'surface-gradient-end': linearTheme.colors.surfaceGradientEnd,
          'panel-solid': linearTheme.colors.panelSolid,
          'panel-border': linearTheme.colors.panelBorder,
          'panel-frost-fill': linearTheme.colors.panelFrostFill,
          'panel-frost-top': linearTheme.colors.panelFrostTop,
          'surface-inset': linearTheme.colors.surfaceInset,
          'surface-tint': linearTheme.colors.surfaceTint,
          // Glass overlays
          'glass-tint': linearTheme.colors.glassTintStart,
          'glass-purple': linearTheme.colors.glassPurpleStart,
          // Text
          'text-primary': linearTheme.colors.textPrimary,
          'text-secondary': linearTheme.colors.textSecondary,
          'text-muted': linearTheme.colors.textMuted,
          'text-inverse': linearTheme.colors.textInverse,
          // Accents & States
          accent: linearTheme.colors.accent,
          'accent-glow': linearTheme.colors.accentGlow,
          'accent-surface': linearTheme.colors.accentSurface,
          'accent-border': linearTheme.colors.accentBorder,
          success: linearTheme.colors.success,
          warning: linearTheme.colors.warning,
          error: linearTheme.colors.error,
          'success-surface': linearTheme.colors.successSurface,
          'error-surface': linearTheme.colors.errorSurface,
          'border-light': linearTheme.colors.borderLight,
          'primary-tint-soft': linearTheme.colors.primaryTintSoft,
        },
        spacing: {
          xs: `${linearTheme.spacing.xs}px`,
          sm: `${linearTheme.spacing.sm}px`,
          md: `${linearTheme.spacing.md}px`,
          lg: `${linearTheme.spacing.lg}px`,
          xl: `${linearTheme.spacing.xl}px`,
          '2xl': `${linearTheme.spacing['2xl']}px`,
        },
        borderRadius: {
          sm: `${linearTheme.radius.sm}px`,
          md: `${linearTheme.radius.md}px`,
          lg: `${linearTheme.radius.lg}px`,
          xl: `${linearTheme.radius.xl}px`,
          full: `${linearTheme.radius.full}px`,
        },
        backdropBlur: {
          subtle: `${linearTheme.blur.subtle}px`,
          standard: `${linearTheme.blur.standard}px`,
          heavy: `${linearTheme.blur.heavy}px`,
        },
        opacity: {
          pressed: linearTheme.alpha.pressed,
          disabled: linearTheme.alpha.disabled,
        },
        fontFamily: {
          'display': ['Inter_900Black'],
          'title': ['Inter_800ExtraBold'],
          'section-title': ['Inter_700Bold'],
          'body': ['Inter_400Regular'],
          'body-small': ['Inter_400Regular'],
          'label': ['Inter_600SemiBold'],
          'caption': ['Inter_500Medium'],
          'chip': ['Inter_700Bold'],
          'badge': ['Inter_700Bold'],
          'meta': ['Inter_500Medium'],
          'button': ['Inter_700Bold'],
        },
        fontSize: {
          'display': [`${linearTheme.typography.display.fontSize}px`, { lineHeight: `${linearTheme.typography.display.lineHeight}px` }],
          'title': [`${linearTheme.typography.title.fontSize}px`, { lineHeight: `${linearTheme.typography.title.lineHeight}px` }],
          'section-title': [`${linearTheme.typography.sectionTitle.fontSize}px`, { lineHeight: `${linearTheme.typography.sectionTitle.lineHeight}px` }],
          'body': [`${linearTheme.typography.body.fontSize}px`, { lineHeight: `${linearTheme.typography.body.lineHeight}px` }],
          'body-small': [`${linearTheme.typography.bodySmall.fontSize}px`, { lineHeight: `${linearTheme.typography.bodySmall.lineHeight}px` }],
          'label': [`${linearTheme.typography.label.fontSize}px`, { lineHeight: `${linearTheme.typography.label.lineHeight}px` }],
          'caption': [`${linearTheme.typography.caption.fontSize}px`, { lineHeight: `${linearTheme.typography.caption.lineHeight}px` }],
          'chip': [`${linearTheme.typography.chip.fontSize}px`, { lineHeight: `${linearTheme.typography.chip.lineHeight}px` }],
          'badge': [`${linearTheme.typography.badge.fontSize}px`, { lineHeight: `${linearTheme.typography.badge.lineHeight}px` }],
          'meta': [`${linearTheme.typography.meta.fontSize}px`, { lineHeight: `${linearTheme.typography.meta.lineHeight}px` }],
          'button': [`${linearTheme.typography.button.fontSize}px`, { lineHeight: `${linearTheme.typography.button.lineHeight}px` }],
        },
      },
    },
    plugins: [],
  };

  // NativeWind's Metro integration requires `presets: [require('nativewind/preset')]` (see nativewind/metro).
  const configString = `/** Generated by scripts/buildTailwindConfig.ts - DO NOT EDIT MANUALLY */
module.exports = Object.assign({ presets: [require('nativewind/preset')] }, ${JSON.stringify(
    config,
    null,
    2,
  )});`;

  const outputPath = path.join(__dirname, '..', 'tailwind.config.js');
  fs.writeFileSync(outputPath, configString);
  console.log(`✅ Tailwind config generated at ${outputPath}`);
}

if (require.main === module) {
  try {
    generateTailwindConfig();
  } catch (error) {
    console.error('❌ Failed to generate Tailwind config:', error);
    process.exit(1);
  }
}