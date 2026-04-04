import React from 'react';
import { View, StyleSheet, type ViewProps } from 'react-native';
import { linearTheme } from '../../theme/linearTheme';
import LinearText from './LinearText';

export type LinearBadgeVariant = 'default' | 'accent' | 'success' | 'warning' | 'error';

interface LinearBadgeProps extends ViewProps {
  label: string;
  variant?: LinearBadgeVariant;
}

export default function LinearBadge({
  label,
  variant = 'default',
  style,
  ...props
}: LinearBadgeProps) {
  return (
    <View style={[styles.base, variantStyles[variant], style]} {...props}>
      <LinearText variant="badge" style={[styles.text, textStyles[variant]]}>
        {label}
      </LinearText>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    paddingHorizontal: linearTheme.spacing.sm,
    paddingVertical: linearTheme.spacing.xs,
    borderRadius: linearTheme.radius.full, // pill shaped
    borderWidth: 1,
    alignSelf: 'flex-start',
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    textTransform: 'uppercase',
  },
});

const variantStyles = StyleSheet.create({
  default: {
    backgroundColor: linearTheme.colors.surface,
    borderColor: linearTheme.colors.border,
  },
  accent: {
    backgroundColor: `${linearTheme.colors.accent}16`,
    borderColor: `${linearTheme.colors.accent}52`,
  },
  success: {
    backgroundColor: `${linearTheme.colors.success}16`,
    borderColor: `${linearTheme.colors.success}52`,
  },
  warning: {
    backgroundColor: `${linearTheme.colors.warning}16`,
    borderColor: `${linearTheme.colors.warning}52`,
  },
  error: {
    backgroundColor: `${linearTheme.colors.error}16`,
    borderColor: `${linearTheme.colors.error}52`,
  },
});

const textStyles = StyleSheet.create({
  default: { color: linearTheme.colors.textSecondary },
  accent: { color: linearTheme.colors.accent },
  success: { color: linearTheme.colors.success },
  warning: { color: linearTheme.colors.warning },
  error: { color: linearTheme.colors.error },
});
