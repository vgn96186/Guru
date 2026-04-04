import React from 'react';
import { View, StyleSheet, type ViewProps, type ViewStyle, type StyleProp } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { linearTheme } from '../../theme/linearTheme';

// Hoisted constants — created once, shared across all instances
const GRADIENT_COLORS = [
  linearTheme.colors.surfaceGradientStart,
  linearTheme.colors.surfaceGradientMid,
  linearTheme.colors.surfaceGradientEnd,
] as const;
const GRADIENT_LOCATIONS = [0, 0.4, 1] as const;
const GRADIENT_START = { x: 0, y: 0 } as const;
const GRADIENT_END = { x: 0, y: 1 } as const;

interface LinearSurfaceProps extends ViewProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  borderColor?: string;
  padded?: boolean;
  compact?: boolean;
}

export default function LinearSurface({
  children,
  style,
  borderColor = linearTheme.colors.border,
  padded = true,
  compact = false,
  ...rest
}: LinearSurfaceProps) {
  const baseStyle = compact ? styles.baseCompact : styles.base;

  let contentStyle: object;
  if (!padded) {
    contentStyle = styles.content;
  } else if (compact) {
    contentStyle = styles.paddedCompactContent;
  } else {
    contentStyle = styles.paddedContent;
  }

  return (
    <View style={[baseStyle, { borderColor }, style]} {...rest}>
      <LinearGradient
        pointerEvents="none"
        colors={GRADIENT_COLORS}
        locations={GRADIENT_LOCATIONS}
        start={GRADIENT_START}
        end={GRADIENT_END}
        style={StyleSheet.absoluteFill}
      />
      <View pointerEvents="none" style={styles.frostLayer} />
      <View pointerEvents="none" style={styles.tintLayer} />
      <View pointerEvents="none" style={styles.topEdge} />
      <View style={contentStyle}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: linearTheme.radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
    backgroundColor: linearTheme.colors.surface,
  },
  baseCompact: {
    borderRadius: linearTheme.radius.md,
    borderWidth: 1,
    overflow: 'hidden',
    backgroundColor: linearTheme.colors.surface,
  },
  topEdge: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: linearTheme.colors.borderHighlight,
  },
  frostLayer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: linearTheme.colors.surfaceInset,
  },
  tintLayer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: linearTheme.colors.surfaceTint,
    opacity: 0.36,
  },
  content: {
    padding: 0,
  },
  paddedContent: {
    padding: linearTheme.spacing.lg,
  },
  paddedCompactContent: {
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
});
