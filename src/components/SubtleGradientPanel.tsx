import React from 'react';
import type { ViewProps, ViewStyle, StyleProp } from 'react-native';
import LinearSurface from './primitives/LinearSurface';
import { linearTheme } from '../theme/linearTheme';

interface SubtleGradientPanelProps extends ViewProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  borderColor?: string;
}

export default function SubtleGradientPanel({
  children,
  style,
  borderColor = linearTheme.colors.border,
  ...rest
}: SubtleGradientPanelProps) {
  return (
    <LinearSurface style={style} borderColor={borderColor} {...rest}>
      {children}
    </LinearSurface>
  );
}
