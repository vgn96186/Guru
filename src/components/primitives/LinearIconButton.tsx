import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  View,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { linearTheme } from '../../theme/linearTheme';

export type LinearIconButtonVariant =
  | 'ghost'
  | 'secondary'
  | 'accent'
  | 'danger';
export type LinearIconButtonSize = 'sm' | 'md' | 'lg';
export type LinearIconButtonShape = 'rounded' | 'round';

interface LinearIconButtonProps extends Omit<PressableProps, 'style'> {
  children?: React.ReactNode;
  variant?: LinearIconButtonVariant;
  size?: LinearIconButtonSize;
  shape?: LinearIconButtonShape;
  loading?: boolean;
  spinnerColor?: string;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
}

export default function LinearIconButton({
  children,
  variant = 'secondary',
  size = 'md',
  shape = 'rounded',
  loading = false,
  spinnerColor = variant === 'accent' ? linearTheme.colors.textInverse : linearTheme.colors.accent,
  disabled,
  style,
  contentStyle,
  accessibilityState,
  ...props
}: LinearIconButtonProps) {
  const resolvedDisabled = disabled || loading;

  return (
    <Pressable
      {...props}
      disabled={resolvedDisabled}
      accessibilityRole="button"
      accessibilityState={{
        ...accessibilityState,
        disabled: resolvedDisabled,
        busy: loading || accessibilityState?.busy,
      }}
      style={({ pressed }) => [
        styles.base,
        sizeStyles[size],
        shape === 'round' ? styles.shapeRound : styles.shapeRounded,
        variantStyles[variant],
        pressed && styles.pressed,
        resolvedDisabled && styles.disabled,
        style,
      ]}
    >
      <View style={[styles.content, contentStyle]}>
        {loading ? <ActivityIndicator size="small" color={spinnerColor} /> : children}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  content: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  shapeRounded: {
    borderRadius: linearTheme.radius.md,
  },
  shapeRound: {
    borderRadius: linearTheme.radius.full,
  },
  pressed: {
    opacity: linearTheme.alpha.pressed,
  },
  disabled: {
    opacity: linearTheme.alpha.disabled,
  },
});

const sizeStyles = StyleSheet.create({
  sm: {
    width: 32,
    height: 32,
  },
  md: {
    width: 36,
    height: 36,
  },
  lg: {
    width: 44,
    height: 44,
  },
});

const variantStyles = StyleSheet.create({
  ghost: {
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderColor: 'transparent',
  },
  secondary: {
    backgroundColor: linearTheme.colors.card,
    borderColor: linearTheme.colors.border,
  },
  accent: {
    backgroundColor: linearTheme.colors.accent,
    borderColor: `${linearTheme.colors.accent}AA`,
  },
  danger: {
    backgroundColor: linearTheme.colors.error,
    borderColor: `${linearTheme.colors.error}AA`,
  },
});
