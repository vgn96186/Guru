import React from 'react';
import {
  Pressable,
  StyleSheet,
  View,
  type PressableProps,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { linearTheme } from '../../theme/linearTheme';
import LinearText from './LinearText';

export type LinearChipButtonTone = 'neutral' | 'accent' | 'success' | 'warning' | 'error';

interface LinearChipButtonProps extends Omit<PressableProps, 'style'> {
  label: string;
  selected?: boolean;
  tone?: LinearChipButtonTone;
  style?: StyleProp<ViewStyle>;
  selectedStyle?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  selectedTextStyle?: StyleProp<TextStyle>;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export default function LinearChipButton({
  label,
  selected = false,
  tone = 'accent',
  style,
  selectedStyle,
  textStyle,
  selectedTextStyle,
  leftIcon,
  rightIcon,
  disabled,
  accessibilityState,
  ...props
}: LinearChipButtonProps) {
  const resolvedDisabled = disabled ?? false;

  return (
    <Pressable
      {...props}
      disabled={resolvedDisabled}
      accessibilityRole="button"
      accessibilityState={{
        ...accessibilityState,
        disabled: resolvedDisabled,
        selected,
      }}
      style={({ pressed }) => [
        styles.base,
        styles.unselected,
        selected && selectedContainerStyles[tone],
        pressed && styles.pressed,
        resolvedDisabled && styles.disabled,
        style,
        selected && selectedStyle,
      ]}
    >
      <View style={styles.content}>
        {leftIcon ? <View style={styles.iconSlot}>{leftIcon}</View> : null}
        <LinearText
          variant="chip"
          style={[
            styles.textBase,
            styles.unselectedText,
            selected && selectedTextStyles[tone],
            textStyle,
            selected && selectedTextStyle,
          ]}
        >
          {label}
        </LinearText>
        {rightIcon ? <View style={styles.iconSlot}>{rightIcon}</View> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 32,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: linearTheme.radius.full,
    borderWidth: 1,
    alignSelf: 'flex-start',
    justifyContent: 'center',
  },
  unselected: {
    backgroundColor: linearTheme.colors.surface,
    borderColor: linearTheme.colors.border,
  },
  pressed: {
    opacity: linearTheme.alpha.pressed,
  },
  disabled: {
    opacity: linearTheme.alpha.disabled,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: linearTheme.spacing.xs,
  },
  iconSlot: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  textBase: {
    includeFontPadding: false,
  },
  unselectedText: {
    color: linearTheme.colors.textSecondary,
  },
});

const selectedContainerStyles = StyleSheet.create({
  neutral: {
    backgroundColor: linearTheme.colors.card,
    borderColor: linearTheme.colors.borderHighlight,
  },
  accent: {
    backgroundColor: `${linearTheme.colors.accent}22`,
    borderColor: linearTheme.colors.accent,
  },
  success: {
    backgroundColor: `${linearTheme.colors.success}18`,
    borderColor: linearTheme.colors.success,
  },
  warning: {
    backgroundColor: `${linearTheme.colors.warning}18`,
    borderColor: linearTheme.colors.warning,
  },
  error: {
    backgroundColor: `${linearTheme.colors.error}18`,
    borderColor: linearTheme.colors.error,
  },
});

const selectedTextStyles = StyleSheet.create({
  neutral: {
    color: linearTheme.colors.textPrimary,
    fontWeight: '700',
  },
  accent: {
    color: linearTheme.colors.accent,
    fontWeight: '700',
  },
  success: {
    color: linearTheme.colors.success,
    fontWeight: '700',
  },
  warning: {
    color: linearTheme.colors.warning,
    fontWeight: '700',
  },
  error: {
    color: linearTheme.colors.error,
    fontWeight: '700',
  },
});
