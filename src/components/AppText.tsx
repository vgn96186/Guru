import React from 'react';
import type { TextProps } from 'react-native';
import LinearText, {
  type LinearTextTone,
  type LinearTextVariant,
} from './primitives/LinearText';

type AppTextVariant = LinearTextVariant;
type AppTextTone = LinearTextTone;

interface AppTextProps extends TextProps {
  variant?: AppTextVariant;
  tone?: AppTextTone;
  truncate?: boolean;
  centered?: boolean;
}

export default function AppText({
  variant = 'body',
  tone = 'primary',
  allowFontScaling = true,
  truncate = false,
  centered = false,
  style,
  ...props
}: AppTextProps) {
  return (
    <LinearText
      {...props}
      variant={variant}
      tone={tone}
      allowFontScaling={allowFontScaling}
      truncate={truncate}
      centered={centered}
      style={style}
    />
  );
}
