import React from 'react';
import { View, useWindowDimensions } from 'react-native';

const TABLET_BREAKPOINT = 600;
const MAX_CONTENT_WIDTH = 800;

const SPACING_FACTOR = 1.8;
const FONT_FACTOR = 1.3;
const SIZE_FACTOR = 1.4;

export function useResponsive() {
  const { width } = useWindowDimensions();
  const isTablet = width >= TABLET_BREAKPOINT;

  const s = isTablet ? (value: number) => Math.round(value * SPACING_FACTOR) : (value: number) => value;
  const f = isTablet ? (value: number) => Math.round(value * FONT_FACTOR) : (value: number) => value;
  const sz = isTablet ? (value: number) => Math.round(value * SIZE_FACTOR) : (value: number) => value;

  return { s, f, sz, isTablet, maxContentWidth: isTablet ? MAX_CONTENT_WIDTH : undefined };
}

export function ResponsiveContainer({ children, style, testID }: { children: React.ReactNode, style?: any, testID?: string }) {
  const { isTablet, maxContentWidth } = useResponsive();

  return React.createElement(View, {
    style: [
      { flex: 1, width: '100%' },
      isTablet && { maxWidth: maxContentWidth, alignSelf: 'center' as const },
      style
    ],
    testID,
  }, children);
}
