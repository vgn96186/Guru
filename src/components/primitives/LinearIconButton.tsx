import React, { useCallback, useMemo } from 'react';
import { ActivityIndicator, Pressable, View, type PressableProps } from 'react-native';
import { tv } from 'tailwind-variants';
import * as Haptics from 'expo-haptics';

export type LinearIconButtonVariant = 'ghost' | 'secondary' | 'accent' | 'danger';
export type LinearIconButtonSize = 'sm' | 'md' | 'lg';
export type LinearIconButtonShape = 'rounded' | 'round';

const spinnerColorMap: Record<LinearIconButtonVariant, string> = {
  ghost: '#7A7A80',
  secondary: '#FAFAFA',
  accent: '#FAFAFA',
  danger: '#FAFAFA',
};

interface LinearIconButtonProps extends Omit<PressableProps, 'style' | 'className'> {
  children?: React.ReactNode;
  variant?: LinearIconButtonVariant;
  size?: LinearIconButtonSize;
  shape?: LinearIconButtonShape;
  loading?: boolean;
  spinnerColor?: string;
  className?: string;
  /** @deprecated Use className instead */
  style?: PressableProps['style'];
  contentClassName?: string;
  /** Callback when press starts - use for custom haptics or state changes */
  onPressIn?: PressableProps['onPressIn'];
  /** Callback when press ends */
  onPressOut?: PressableProps['onPressOut'];
}

const iconButtonVariants = tv({
  base: 'items-center justify-center border',
  variants: {
    variant: {
      ghost: 'bg-white/[0.02] border-transparent',
      secondary: 'bg-card border-border',
      accent: 'bg-accent border-accent/[0.67]',
      danger: 'bg-error border-error/[0.67]',
    },
    size: {
      sm: 'w-8 h-8',
      md: 'w-9 h-9',
      lg: 'w-11 h-11',
    },
    shape: {
      rounded: 'rounded-xl',
      round: 'rounded-full',
    },
    disabled: {
      true: 'opacity-[0.55]',
    },
  },
  defaultVariants: {
    variant: 'secondary',
    size: 'md',
    shape: 'rounded',
    disabled: false,
  },
});

export default function LinearIconButton({
  children,
  variant = 'secondary',
  size = 'md',
  shape = 'rounded',
  loading = false,
  spinnerColor,
  disabled,
  className,
  style,
  contentClassName,
  accessibilityState,
  onPressIn,
  onPressOut,
  ...props
}: LinearIconButtonProps) {
  const resolvedDisabled = disabled || loading;
  const finalSpinnerColor = spinnerColor ?? spinnerColorMap[variant];

  // Memoize class to prevent re-renders
  const buttonClassName = useMemo(
    () =>
      iconButtonVariants({
        variant,
        size,
        shape,
        disabled: resolvedDisabled,
        className,
      }),
    [variant, size, shape, resolvedDisabled, className],
  );

  // Haptic feedback on press
  const handlePressIn = useCallback(
    (e: Parameters<NonNullable<PressableProps['onPressIn']>>[0]) => {
      if (!resolvedDisabled) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
      onPressIn?.(e);
    },
    [resolvedDisabled, onPressIn],
  );

  // Memoize dynamic style function
  const dynamicStyle = typeof style === 'function' ? style : null;

  return (
    <Pressable
      {...props}
      disabled={resolvedDisabled}
      onPressIn={handlePressIn}
      onPressOut={onPressOut}
      accessibilityRole="button"
      accessibilityState={{
        ...accessibilityState,
        disabled: resolvedDisabled,
        busy: loading || accessibilityState?.busy,
      }}
      className={buttonClassName}
      android_ripple={{ color: 'rgba(255, 255, 255, 0.1)', borderless: false }}
      // @ts-expect-error - Pressable style callback returning mixed array is valid RN pattern
      style={({ pressed }) => {
        const pressedOpacity = pressed ? 0.5 : resolvedDisabled ? 0.55 : 1;
        const dynamicStyleFn = dynamicStyle;
        return [{ opacity: pressedOpacity }, dynamicStyleFn ? dynamicStyleFn({ pressed }) : style];
      }}
    >
      <View className={`items-center justify-center ${contentClassName ?? ''}`}>
        {loading ? <ActivityIndicator size="small" color={finalSpinnerColor} /> : children}
      </View>
    </Pressable>
  );
}
