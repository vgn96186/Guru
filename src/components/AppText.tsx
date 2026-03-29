import React from 'react';
import { StyleSheet, Text, type TextProps } from 'react-native';
import { theme } from '../constants/theme';

type AppTextVariant =
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

type AppTextTone =
  | 'primary'
  | 'secondary'
  | 'muted'
  | 'inverse'
  | 'accent'
  | 'warning'
  | 'success'
  | 'error';

interface AppTextProps extends TextProps {
  variant?: AppTextVariant;
  tone?: AppTextTone;
  truncate?: boolean;
  centered?: boolean;
}

const variantStyles = StyleSheet.create({
  display: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '900',
  },
  title: {
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '800',
  },
  sectionTitle: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '700',
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '400',
  },
  bodySmall: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '400',
  },
  label: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
  caption: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '500',
  },
  chip: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '700',
  },
  badge: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '700',
  },
  meta: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500',
  },
});

const toneStyles = StyleSheet.create({
  primary: { color: theme.colors.textPrimary },
  secondary: { color: theme.colors.textSecondary },
  muted: { color: theme.colors.textMuted },
  inverse: { color: theme.colors.textInverse },
  accent: { color: theme.colors.primaryLight },
  warning: { color: theme.colors.warning },
  success: { color: theme.colors.success },
  error: { color: theme.colors.error },
});

const styles = StyleSheet.create({
  base: {
    includeFontPadding: false,
    paddingRight: 2,
  },
  centered: {
    textAlign: 'center',
  },
});

export default function AppText({
  variant = 'body',
  tone = 'primary',
  allowFontScaling = true,
  truncate = false,
  centered = false,
  style,
  ...props
}: AppTextProps) {
  return (
    <Text
      textBreakStrategy="simple"
      {...props}
      allowFontScaling={allowFontScaling}
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
