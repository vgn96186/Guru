import React, { useCallback, useMemo } from 'react';
import { ActivityIndicator, Pressable, View, type PressableProps } from 'react-native';
import { tv } from 'tailwind-variants';
import * as Haptics from 'expo-haptics';
import LinearText, { type LinearTextTone } from './LinearText';

export type LinearButtonVariant = 'primary' | 'secondary' | 'ghost';
export type LinearButtonTone = 'neutral' | 'danger';
export type LinearButtonSize = 'sm' | 'md' | 'lg';

function resolveLegacyVariant(v: LinearButtonVariant): {
  variant: LinearButtonVariant;
  tone: LinearButtonTone;
} {
  return { variant: v, tone: 'neutral' };
}

interface LinearButtonProps extends Omit<PressableProps, 'style' | 'className'> {
  label: string;
  variant?: LinearButtonVariant;
  tone?: LinearButtonTone;
  size?: LinearButtonSize;
  loading?: boolean;
  loadingLabel?: string;
  textTone?: LinearTextTone;
  className?: string;
  /** @deprecated Use className instead */
  style?: PressableProps['style'];
  /** @deprecated Use className on LinearText instead */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic/trusted type
  textStyle?: any;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  /** Callback when press starts - use for custom haptics or state changes */
  onPressIn?: PressableProps['onPressIn'];
  /** Callback when press ends */
  onPressOut?: PressableProps['onPressOut'];
}

const buttonVariants = tv({
  base: 'items-center justify-center rounded-xl',
  variants: {
    variant: {
      primary: 'bg-accent border border-accentBorder',
      primaryDanger: 'bg-error border border-error/65',
      secondary: 'bg-white/[0.02] border border-white/10',
      secondaryDanger: 'bg-error/[0.06] border border-error/35',
      ghost: 'bg-transparent',
    },
    size: {
      sm: 'min-h-[36px] px-4 py-2',
      md: 'min-h-[44px] px-6 py-4',
      lg: 'min-h-[52px] px-6 py-4',
    },
    disabled: {
      true: 'opacity-[0.55]',
    },
  },
  defaultVariants: {
    variant: 'primary',
    size: 'md',
    disabled: false,
  },
});

export default function LinearButton({
  label,
  variant = 'primary',
  tone: toneProp,
  size = 'md',
  loading = false,
  loadingLabel,
  textTone,
  className,
  style,
  textStyle,
  leftIcon,
  rightIcon,
  disabled,
  accessibilityState,
  onPressIn,
  onPressOut,
  ...props
}: LinearButtonProps) {
  const { variant: v, tone: resolvedTone } = resolveLegacyVariant(variant);
  const finalTone: LinearButtonTone = toneProp ?? resolvedTone;
  const textTn = textTone ?? getDefaultTextTone(v, finalTone);
  const isDanger = finalTone === 'danger';
  const resolvedDisabled = disabled || loading;
  const resolvedLabel = loading ? (loadingLabel ?? null) : label;
  const spinnerColor = getSpinnerColor(textTn);
  const leadingDecoration = loading ? (
    <ActivityIndicator size="small" color={spinnerColor} />
  ) : (
    leftIcon
  );
  const trailingDecoration = loading ? (
    resolvedLabel ? (
      <View className="w-6 items-center justify-center" />
    ) : null
  ) : (
    rightIcon
  );
  const useDecoratedLayout =
    resolvedLabel != null && (leadingDecoration != null || trailingDecoration != null);

  const variantKey: 'primary' | 'primaryDanger' | 'secondary' | 'secondaryDanger' | 'ghost' =
    v === 'primary'
      ? isDanger
        ? 'primaryDanger'
        : 'primary'
      : v === 'secondary'
        ? isDanger
          ? 'secondaryDanger'
          : 'secondary'
        : 'ghost';

  // Memoize the button class to prevent re-renders
  const buttonClassName = useMemo(
    () =>
      buttonVariants({
        variant: variantKey,
        size,
        disabled: resolvedDisabled,
        className,
      }),
    [variantKey, size, resolvedDisabled, className],
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

  // Memoize base style to prevent recreation on every render
  const dynamicStyle = typeof style === 'function' ? style : null;

  return (
    <Pressable
      {...props}
      disabled={resolvedDisabled}
      onPressIn={handlePressIn}
      onPressOut={onPressOut}
      accessibilityState={{
        ...accessibilityState,
        disabled: resolvedDisabled,
        busy: loading || accessibilityState?.busy,
      }}
      className={buttonClassName}
      // @ts-expect-error - Pressable style callback returning mixed array is valid RN pattern
      style={({ pressed }) => {
        const baseOpacity = resolvedDisabled ? 0.55 : 1;
        const pressedOpacity = pressed ? 0.88 : 1;
        const dynamicStyleFn = dynamicStyle;
        return [
          { opacity: baseOpacity * pressedOpacity },
          dynamicStyleFn ? dynamicStyleFn({ pressed }) : style,
        ];
      }}
      accessibilityRole="button"
    >
      <View className="flex-row items-center justify-center gap-2 w-full min-w-0">
        {useDecoratedLayout ? (
          <>
            <View className="w-6 items-center justify-center">{leadingDecoration}</View>
            <View className="flex-1 items-center justify-center min-w-0">
              <LinearText
                variant="button"
                tone={textTn}
                className="text-center flex-shrink min-w-0"
                style={textStyle}
              >
                {resolvedLabel}
              </LinearText>
            </View>
            <View className="w-6 items-center justify-center">{trailingDecoration}</View>
          </>
        ) : resolvedLabel != null ? (
          <LinearText
            variant="button"
            tone={textTn}
            className="text-center flex-shrink min-w-0"
            style={textStyle}
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

function getDefaultTextTone(variant: LinearButtonVariant, tone: LinearButtonTone): LinearTextTone {
  if (variant === 'primary') return tone === 'danger' ? 'primary' : 'inverse';
  if (tone === 'danger') return 'error';
  return 'primary';
}

const toneColorMap: Record<LinearTextTone, string> = {
  inverse: '#000000',
  accent: '#5E6AD2',
  warning: '#D97706',
  success: '#3FB950',
  error: '#F14C4C',
  secondary: '#B8B8BD',
  muted: '#7A7A80',
  primary: '#FAFAFA',
};

function getSpinnerColor(tone: LinearTextTone): string {
  return toneColorMap[tone] ?? toneColorMap.primary;
}
