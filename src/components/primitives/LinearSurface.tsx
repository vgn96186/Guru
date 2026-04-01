import React, { useRef } from 'react';
import { View, StyleSheet, type ViewProps, type ViewStyle, type StyleProp } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { linearTheme } from '../../theme/linearTheme';

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
  const gradientIdRef = useRef(`linear-surface-${Math.random().toString(36).slice(2, 9)}`);

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
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <Svg width="100%" height="100%" preserveAspectRatio="none">
          <Defs>
            <LinearGradient id={gradientIdRef.current} x1="0%" y1="0%" x2="0%" y2="100%">
              <Stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.04" />
              <Stop offset="60%" stopColor="#FFFFFF" stopOpacity="0.01" />
              <Stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${gradientIdRef.current})`} />
        </Svg>
      </View>
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
    height: 1,
    backgroundColor: linearTheme.colors.borderHighlight,
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
