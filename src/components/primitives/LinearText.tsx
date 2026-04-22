import React from 'react';
import { Text, type TextProps } from 'react-native';
import { tv } from 'tailwind-variants';

export type LinearTextVariant =
  | 'display'
  | 'title'
  | 'sectionTitle'
  | 'body'
  | 'bodySmall'
  | 'button'
  | 'label'
  | 'caption'
  | 'chip'
  | 'badge'
  | 'meta';

export type LinearTextTone =
  | 'primary'
  | 'secondary'
  | 'muted'
  | 'inverse'
  | 'accent'
  | 'warning'
  | 'success'
  | 'error';

interface LinearTextProps extends Omit<TextProps, 'style'> {
  variant?: LinearTextVariant;
  tone?: LinearTextTone;
  centered?: boolean;
  truncate?: boolean;
  className?: string;
  /** @deprecated Use className instead */
  style?: any;
}

const textVariants = tv({
  base: 'font-inter include-font-padding-false',
  variants: {
    variant: {
      display: 'text-[32px] leading-[36px] font-bold tracking-[-0.6px]',
      title: 'text-[22px] leading-[28px] font-semibold tracking-[-0.3px]',
      sectionTitle: 'text-[16px] leading-[22px] font-semibold tracking-[-0.1px]',
      body: 'text-[15px] leading-[22px] font-normal',
      bodySmall: 'text-[13px] leading-[20px] font-normal',
      button: 'text-[14px] leading-[18px] font-semibold tracking-[0.1px]',
      label: 'text-[12px] leading-[18px] font-medium tracking-[0.4px]',
      caption: 'text-[12px] leading-[18px] font-normal',
      chip: 'text-[12px] leading-[16px] font-semibold tracking-[0.2px]',
      badge: 'text-[11px] leading-[14px] font-semibold tracking-[0.3px]',
      meta: 'text-[12px] leading-[16px] font-medium',
    },
    tone: {
      primary: 'text-textPrimary',
      secondary: 'text-textSecondary',
      muted: 'text-textMuted',
      inverse: 'text-textInverse',
      accent: 'text-accent',
      warning: 'text-warning',
      success: 'text-success',
      error: 'text-error',
    },
    centered: {
      true: 'text-center',
    },
    truncate: {
      true: 'flex-shrink',
    },
  },
  defaultVariants: {
    variant: 'body',
    tone: 'primary',
    centered: false,
    truncate: false,
  },
});

export default function LinearText({
  variant = 'body',
  tone = 'primary',
  centered = false,
  truncate = false,
  allowFontScaling = true,
  className,
  style,
  ...props
}: LinearTextProps) {
  const variantClass = textVariants({ variant, tone, centered, truncate, className });

  // Flatten style array to remove falsy values for compatibility
  const flattenedStyle = Array.isArray(style)
    ? style.filter((s): s is NonNullable<typeof s> => Boolean(s))
    : style;

  return (
    <Text
      {...props}
      allowFontScaling={allowFontScaling}
      textBreakStrategy="simple"
      numberOfLines={truncate ? 1 : props.numberOfLines}
      ellipsizeMode={truncate ? 'clip' : props.ellipsizeMode}
      className={variantClass}
      style={flattenedStyle}
    />
  );
}
