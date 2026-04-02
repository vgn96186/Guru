import React from 'react';
import { Text, StyleSheet, type TextProps } from 'react-native';
import { linearTheme } from '../../theme/linearTheme';

export type LinearTextVariant =
  | 'display'
  | 'title'
  | 'sectionTitle'
  | 'body'
  | 'bodySmall'
  | 'label'
  | 'caption'
  | 'chip'
  | 'badge'
  | 'meta';

export type LinearTextTone =
  | 'primary'
  | 'secondary'
  | 'muted'
  | 'inverse'
  | 'accent'
  | 'warning'
  | 'success'
  | 'error';

interface LinearTextProps extends TextProps {
  variant?: LinearTextVariant;
  tone?: LinearTextTone;
  centered?: boolean;
  truncate?: boolean;
}

const variantStyles = StyleSheet.create({
  display: linearTheme.typography.display,
  title: linearTheme.typography.title,
  sectionTitle: linearTheme.typography.sectionTitle,
  body: linearTheme.typography.body,
  bodySmall: linearTheme.typography.bodySmall,
  label: linearTheme.typography.label,
  caption: linearTheme.typography.caption,
  chip: linearTheme.typography.chip,
  badge: linearTheme.typography.badge,
  meta: linearTheme.typography.meta,
});

const toneStyles = StyleSheet.create({
  primary: { color: linearTheme.colors.textPrimary },
  secondary: { color: linearTheme.colors.textSecondary },
  muted: { color: linearTheme.colors.textMuted },
  inverse: { color: linearTheme.colors.textInverse },
  accent: { color: linearTheme.colors.accent },
  warning: { color: linearTheme.colors.warning },
  success: { color: linearTheme.colors.success },
  error: { color: linearTheme.colors.error },
});

const styles = StyleSheet.create({
  base: {
    includeFontPadding: false,
  },
  centered: {
    textAlign: 'center',
  },
});

export default function LinearText({
  variant = 'body',
  tone = 'primary',
  centered = false,
  truncate = false,
  allowFontScaling = true,
  style,
  ...props
}: LinearTextProps) {
  return (
    <Text
      {...props}
      allowFontScaling={allowFontScaling}
      textBreakStrategy="simple"
      numberOfLines={truncate ? 1 : props.numberOfLines}
      ellipsizeMode={truncate ? 'clip' : props.ellipsizeMode}
      style={[
        styles.base,
        variantStyles[variant],
        toneStyles[tone],
        centered && styles.centered,
        style,
      ]}
    />
  );
}
