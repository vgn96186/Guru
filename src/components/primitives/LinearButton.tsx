import React from 'react';
import {
  Pressable,
  StyleSheet,
  View,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
  type TextStyle,
} from 'react-native';
import { linearTheme } from '../../theme/linearTheme';
import LinearText from './LinearText';

type LinearButtonVariant = 'primary' | 'ghost' | 'outline' | 'glass' | 'glassTinted';

interface LinearButtonProps extends Omit<PressableProps, 'style'> {
  label: string;
  variant?: LinearButtonVariant;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export default function LinearButton({
  label,
  variant = 'primary',
  style,
  textStyle,
  leftIcon,
  rightIcon,
  disabled,
  ...props
}: LinearButtonProps) {
  const tone = variant === 'primary' ? 'inverse' : 'primary';
  const isGlass = variant === 'glass' || variant === 'glassTinted';

  return (
    <Pressable
      {...props}
      disabled={disabled}
      style={({ pressed }) => [
        styles.base,
        variant === 'primary' && styles.primary,
        variant === 'ghost' && styles.ghost,
        variant === 'outline' && styles.outline,
        variant === 'glass' && styles.glass,
        variant === 'glassTinted' && styles.glassTinted,
        pressed && styles.pressed,
        disabled && styles.disabled,
        style,
      ]}
      accessibilityRole="button"
    >
      <View style={styles.contentRow}>
        {leftIcon != null || rightIcon != null ? (
          <View style={styles.iconSlot}>{leftIcon}</View>
        ) : null}
        <View style={styles.labelWrap}>
          <LinearText
            variant="label"
            tone={tone}
            style={[styles.labelBase, isGlass && styles.glassLabel, textStyle]}
          >
            {label}
          </LinearText>
        </View>
        {leftIcon != null || rightIcon != null ? (
          <View style={styles.iconSlot}>{rightIcon}</View>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 44,
    borderRadius: linearTheme.radius.md,
    paddingHorizontal: linearTheme.spacing.lg,
    paddingVertical: linearTheme.spacing.md,
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
