import React from 'react';
import {
  Pressable,
  View,
  type PressableProps,
  type TextStyle,
} from 'react-native';
import { tv } from 'tailwind-variants';
import LinearText from './LinearText';

export type LinearChipButtonTone = 'neutral' | 'accent' | 'success' | 'warning' | 'error';

interface LinearChipButtonProps extends Omit<PressableProps, 'style' | 'className'> {
  label: string;
  selected?: boolean;
  tone?: LinearChipButtonTone;
  className?: string;
  /** @deprecated Use className instead */
  style?: PressableProps['style'];
  /** @deprecated Use className instead */
  selectedStyle?: PressableProps['style'];
  textStyle?: TextStyle;
  /** @deprecated Use className instead */
  selectedTextStyle?: TextStyle;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

const chipVariants = tv({
  base: 'min-h-[32px] px-3 py-1.5 rounded-full border border-border self-start justify-center',
  variants: {
    selected: {
      false: 'bg-surface',
      true: '',
    },
    tone: {
      neutral: '',
      accent: '',
      success: '',
      warning: '',
      error: '',
    },
    disabled: {
      true: 'opacity-[0.55]',
    },
  },
  compoundVariants: [
    { selected: true, tone: 'neutral', class: 'bg-card border-borderHighlight' },
    { selected: true, tone: 'accent', class: 'bg-accent/[0.13] border-accent' },
    { selected: true, tone: 'success', class: 'bg-success/[0.1] border-success' },
    { selected: true, tone: 'warning', class: 'bg-warning/[0.1] border-warning' },
    { selected: true, tone: 'error', class: 'bg-error/[0.1] border-error' },
  ],
  defaultVariants: {
    selected: false,
    tone: 'accent',
    disabled: false,
  },
});

const toneToTextTone: Record<LinearChipButtonTone, 'primary' | 'accent' | 'success' | 'warning' | 'error'> = {
  neutral: 'primary',
  accent: 'accent',
  success: 'success',
  warning: 'warning',
  error: 'error',
};

export default function LinearChipButton({
  label,
  selected = false,
  tone = 'accent',
  className,
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
      className={chipVariants({ selected, tone, disabled: resolvedDisabled, className })}
      style={({ pressed }) => [
        { opacity: pressed ? 0.88 : 1 },
        typeof style === 'function' ? style({ pressed }) : style,
        selected && (typeof selectedStyle === 'function' ? selectedStyle({ pressed }) : selectedStyle),
      ]}
    >
      <View className="flex-row items-center justify-center gap-1">
        {leftIcon ? <View className="items-center justify-center">{leftIcon}</View> : null}
        <LinearText
          variant="chip"
          tone={selected ? toneToTextTone[tone] : 'secondary'}
          className={selected ? 'font-bold' : ''}
          style={[textStyle, selected && selectedTextStyle]}
        >
          {label}
        </LinearText>
        {rightIcon ? <View className="items-center justify-center">{rightIcon}</View> : null}
      </View>
    </Pressable>
  );
}

