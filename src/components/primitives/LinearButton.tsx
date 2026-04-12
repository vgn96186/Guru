import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  View,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
  type TextStyle,
} from 'react-native';
import { linearTheme } from '../../theme/linearTheme';
import LinearText, { type LinearTextTone } from './LinearText';

export type LinearButtonVariant =
  | 'primary'
  | 'ghost'
  | 'outline'
  | 'glass'
  | 'glassTinted'
  | 'danger';
export type LinearButtonSize = 'sm' | 'md' | 'lg';

interface LinearButtonProps extends Omit<PressableProps, 'style'> {
  label: string;
  variant?: LinearButtonVariant;
  size?: LinearButtonSize;
  loading?: boolean;
  loadingLabel?: string;
  textTone?: LinearTextTone;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export default function LinearButton({
  label,
  variant = 'primary',
  size = 'md',
  loading = false,
  loadingLabel,
  textTone,
  style,
  textStyle,
  leftIcon,
  rightIcon,
  disabled,
  accessibilityState,
  ...props
}: LinearButtonProps) {
  const tone = textTone ?? getDefaultTextTone(variant);
  const isGlass = variant === 'glass' || variant === 'glassTinted';
  const resolvedDisabled = disabled || loading;
  const resolvedLabel = loading ? loadingLabel ?? null : label;
  const leadingDecoration = loading ? (
    <ActivityIndicator size="small" color={getSpinnerColor(tone)} />
  ) : (
    leftIcon
  );
  const trailingDecoration = loading ? (
    resolvedLabel ? (
      <View style={styles.iconSlot} />
    ) : null
  ) : (
    rightIcon
  );
  const useDecoratedLayout =
    resolvedLabel != null && (leadingDecoration != null || trailingDecoration != null);

  return (
    <Pressable
      {...props}
      disabled={resolvedDisabled}
      accessibilityState={{
        ...accessibilityState,
        disabled: resolvedDisabled,
        busy: loading || accessibilityState?.busy,
      }}
      style={({ pressed }) => [
        styles.base,
        sizeStyles[size],
        variant === 'primary' && styles.primary,
        variant === 'ghost' && styles.ghost,
        variant === 'outline' && styles.outline,
        variant === 'glass' && styles.glass,
        variant === 'glassTinted' && styles.glassTinted,
        variant === 'danger' && styles.danger,
        pressed && styles.pressed,
        resolvedDisabled && styles.disabled,
        style,
      ]}
      accessibilityRole="button"
    >
      <View style={styles.contentRow}>
        {useDecoratedLayout ? (
          <>
            <View style={styles.iconSlot}>{leadingDecoration}</View>
            <View style={styles.labelWrap}>
              <LinearText
                variant="button"
                tone={tone}
                style={[styles.labelBase, isGlass && styles.glassLabel, textStyle]}
              >
                {resolvedLabel}
              </LinearText>
            </View>
            <View style={styles.iconSlot}>{trailingDecoration}</View>
          </>
        ) : resolvedLabel != null ? (
          <LinearText
            variant="button"
            tone={tone}
            style={[styles.labelBase, isGlass && styles.glassLabel, textStyle]}
          >
            {resolvedLabel}
          </LinearText>
        ) : (
          leadingDecoration
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: linearTheme.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primary: {
    backgroundColor: linearTheme.colors.accent,
    borderWidth: 1,
    borderColor: `${linearTheme.colors.accent}AA`,
  },
  ghost: {
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  outline: {
    borderWidth: 1,
    borderColor: linearTheme.colors.border,
    backgroundColor: linearTheme.colors.surface,
  },
  glass: {
    borderWidth: 1,
    borderColor: linearTheme.colors.borderHighlight,
    backgroundColor: linearTheme.colors.card,
  },
  glassTinted: {
    borderWidth: 1,
    borderColor: `${linearTheme.colors.accent}70`,
    backgroundColor: linearTheme.colors.primaryTintSoft,
  },
  danger: {
    backgroundColor: linearTheme.colors.error,
    borderWidth: 1,
    borderColor: `${linearTheme.colors.error}AA`,
  },
  pressed: {
    opacity: linearTheme.alpha.pressed,
  },
  disabled: {
    opacity: linearTheme.alpha.disabled,
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: linearTheme.spacing.sm,
    width: '100%',
    minWidth: 0,
  },
  iconSlot: {
    width: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  labelWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 0,
  },
  labelBase: {
    textAlign: 'center',
    flexShrink: 1,
    minWidth: 0,
  },
  glassLabel: {
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
});

const sizeStyles = StyleSheet.create({
  sm: {
    minHeight: 36,
    paddingHorizontal: linearTheme.spacing.md,
    paddingVertical: linearTheme.spacing.sm,
  },
  md: {
    minHeight: 44,
    paddingHorizontal: linearTheme.spacing.lg,
    paddingVertical: linearTheme.spacing.md,
  },
  lg: {
    minHeight: 52,
    paddingHorizontal: linearTheme.spacing.lg,
    paddingVertical: linearTheme.spacing.md,
  },
});

function getDefaultTextTone(variant: LinearButtonVariant): LinearTextTone {
  switch (variant) {
    case 'primary':
      return 'inverse';
    case 'danger':
      return 'primary';
    default:
      return 'primary';
  }
}

function getSpinnerColor(tone: LinearTextTone): string {
  switch (tone) {
    case 'inverse':
      return linearTheme.colors.textInverse;
    case 'accent':
      return linearTheme.colors.accent;
    case 'warning':
      return linearTheme.colors.warning;
    case 'success':
      return linearTheme.colors.success;
    case 'error':
      return linearTheme.colors.error;
    case 'secondary':
      return linearTheme.colors.textSecondary;
    case 'muted':
      return linearTheme.colors.textMuted;
    case 'primary':
    default:
      return linearTheme.colors.textPrimary;
  }
}
