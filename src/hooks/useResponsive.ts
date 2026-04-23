import React from 'react';
import { View, useWindowDimensions } from 'react-native';

const TABLET_BREAKPOINT = 600;

const SPACING_FACTOR = 1.8;
const FONT_FACTOR = 1.3;
const SIZE_FACTOR = 1.4;

export function useResponsive() {
  const { width, height } = useWindowDimensions();
  const shortestEdge = Math.min(width, height);
  const isTablet = shortestEdge >= TABLET_BREAKPOINT;
  const isLandscape = width > height;
  // Portrait tablets: cap at 800. Landscape: use 95% of screen width so it fills the device.
  const maxContentWidth = isTablet
    ? isLandscape
      ? Math.round(width * 0.95)
      : Math.min(800, Math.round(width * 0.95))
    : undefined;

  const s = isTablet
    ? (value: number) => Math.round(value * SPACING_FACTOR)
    : (value: number) => value;
  const f = isTablet
    ? (value: number) => Math.round(value * FONT_FACTOR)
    : (value: number) => value;
  const sz = isTablet
    ? (value: number) => Math.round(value * SIZE_FACTOR)
    : (value: number) => value;

  return { s, f, sz, isTablet, isLandscape, maxContentWidth };
}

export function ResponsiveContainer({
  children,
  style,
  testID,
}: {
  children: React.ReactNode;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic/trusted type
  style?: any;
  testID?: string;
}) {
  const { isTablet, maxContentWidth } = useResponsive();

  return React.createElement(
    View,
    {
      style: [
        { flex: 1, width: '100%' },
        isTablet && { maxWidth: maxContentWidth, alignSelf: 'center' as const },
        style,
      ],
      testID,
    },
    children,
  );
}
