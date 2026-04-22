import React from 'react';
import { View, type ViewProps } from 'react-native';
import { tv } from 'tailwind-variants';
import LinearText from './LinearText';

export type LinearBadgeVariant = 'default' | 'accent' | 'success' | 'warning' | 'error';

interface LinearBadgeProps extends Omit<ViewProps, 'style' | 'className'> {
  label: string;
  variant?: LinearBadgeVariant;
  className?: string;
  /** @deprecated Use className instead */
  style?: ViewProps['style'];
}

const badgeVariants = tv({
  base: 'px-2 py-1 rounded-full border self-start items-center justify-center',
  variants: {
    variant: {
      default: 'bg-surface border-border',
      accent: 'bg-accent/[0.09] border-accent/[0.32]',
      success: 'bg-success/[0.09] border-success/[0.32]',
      warning: 'bg-warning/[0.09] border-warning/[0.32]',
      error: 'bg-error/[0.09] border-error/[0.32]',
    },
  },
  defaultVariants: {
    variant: 'default',
  },
});

const textToneMap: Record<LinearBadgeVariant, 'secondary' | 'accent' | 'success' | 'warning' | 'error'> = {
  default: 'secondary',
  accent: 'accent',
  success: 'success',
  warning: 'warning',
  error: 'error',
};

export default function LinearBadge({
  label,
  variant = 'default',
  className,
  style,
  ...props
}: LinearBadgeProps) {
  return (
    <View className={badgeVariants({ variant, className })} style={style} {...props}>
      <LinearText variant="badge" tone={textToneMap[variant]} className="uppercase">
        {label}
      </LinearText>
    </View>
  );
}

