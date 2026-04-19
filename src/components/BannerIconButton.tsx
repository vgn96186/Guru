import React from 'react';
import type { PressableProps, StyleProp, ViewStyle } from 'react-native';
import LinearIconButton from './primitives/LinearIconButton';

interface BannerIconButtonProps extends Omit<PressableProps, 'style'> {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

export default function BannerIconButton({ children, style, ...props }: BannerIconButtonProps) {
  return (
    <LinearIconButton {...props} variant="secondary" shape="round" style={style}>
      {children}
    </LinearIconButton>
  );
}
