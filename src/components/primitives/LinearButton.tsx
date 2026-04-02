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
        {leftIcon ? <View style={styles.leftIcon}>{leftIcon}</View> : null}
        <LinearText
          variant="label"
          tone={tone}
          style={[styles.labelBase, isGlass && styles.glassLabel, textStyle]}
        >
          {label}
        </LinearText>
        {rightIcon ? <View style={styles.rightIcon}>{rightIcon}</View> : null}
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
  },
  ghost: {
    backgroundColor: 'transparent',
  },
  outline: {
    borderWidth: 1,
    borderColor: linearTheme.colors.border,
    backgroundColor: 'transparent',
  },
  glass: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    backgroundColor: 'rgba(255,255,255,0.06)',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 0,
  },
  glassTinted: {
    borderWidth: 1,
    borderColor: 'rgba(130,170,255,0.24)',
    backgroundColor: 'rgba(109,153,255,0.14)',
    shadowColor: linearTheme.colors.accent,
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 0,
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
  },
  leftIcon: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  rightIcon: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  labelBase: {
    textAlign: 'center',
  },
  glassLabel: {
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
});
