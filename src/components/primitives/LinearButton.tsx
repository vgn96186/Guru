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

export type LinearButtonVariant = 'primary' | 'secondary' | 'ghost';
export type LinearButtonTone = 'neutral' | 'danger';
export type LinearButtonSize = 'sm' | 'md' | 'lg';

function resolveLegacyVariant(v: LinearButtonVariant): { variant: LinearButtonVariant; tone: LinearButtonTone } {
  return { variant: v, tone: 'neutral' };
}

interface LinearButtonProps extends Omit<PressableProps, 'style'> {
  label: string;
  variant?: LinearButtonVariant;
  tone?: LinearButtonTone;
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
  tone: toneProp,
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
  const { variant: v, tone: resolvedTone } = resolveLegacyVariant(variant);
  const finalTone: LinearButtonTone = toneProp ?? resolvedTone;
  const textTn = textTone ?? getDefaultTextTone(v, finalTone);
  const isDanger = finalTone === 'danger';
  const resolvedDisabled = disabled || loading;
  const resolvedLabel = loading ? loadingLabel ?? null : label;
  const leadingDecoration = loading ? (
    <ActivityIndicator size="small" color={getSpinnerColor(textTn)} />
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
        v === 'primary' && (isDanger ? styles.primaryDanger : styles.primary),
        v === 'secondary' && (isDanger ? styles.secondaryDanger : styles.secondary),
        v === 'ghost' && styles.ghost,
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
                tone={textTn}
                style={[styles.labelBase, textStyle]}
              >
                {resolvedLabel}
              </LinearText>
            </View>
            <View style={styles.iconSlot}>{trailingDecoration}</View>
          </>
        ) : resolvedLabel != null ? (
          <LinearText
            variant="button"
            tone={textTn}
            style={[styles.labelBase, textStyle]}
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
  primaryDanger: {
    backgroundColor: linearTheme.colors.error,
    borderWidth: 1,
    borderColor: `${linearTheme.colors.error}AA`,
  },
  secondary: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  secondaryDanger: {
    borderWidth: 1,
    borderColor: `${linearTheme.colors.error}55`,
    backgroundColor: 'rgba(241,76,76,0.06)',
  },
  ghost: {
    backgroundColor: 'transparent',
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

function getDefaultTextTone(
  variant: LinearButtonVariant,
  tone: LinearButtonTone,
): LinearTextTone {
  if (variant === 'primary') return tone === 'danger' ? 'primary' : 'inverse';
  if (tone === 'danger') return 'error';
  return 'primary';
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
