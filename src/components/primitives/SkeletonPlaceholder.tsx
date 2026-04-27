/**
 * SkeletonPlaceholder — a reusable shimmer bone for loading states.
 *
 * Usage:
 *   <SkeletonPlaceholder width="60%" height={14} />
 *   <SkeletonPlaceholder width={120} height={40} borderRadius={20} />
 *   <SkeletonPlaceholder circle size={64} />
 */

import React, { useEffect, useRef } from 'react';
import { Animated, Easing, type StyleProp, type ViewStyle } from 'react-native';
import { linearTheme as n } from '../../theme/linearTheme';

interface SkeletonPlaceholderProps {
  /** Width — number (px) or string ('%'). Ignored when `circle` is set. */
  width?: number | `${number}%`;
  /** Height in px. Ignored when `circle` is set. */
  height?: number;
  /** Border radius. Defaults to 8. */
  borderRadius?: number;
  /** Render as a circle — `size` sets both width & height. */
  circle?: boolean;
  /** Circle diameter. Only used when `circle` is true. */
  size?: number;
  /** Extra styles. */
  style?: StyleProp<ViewStyle>;
}

export default function SkeletonPlaceholder({
  width = '100%',
  height = 14,
  borderRadius = 8,
  circle = false,
  size = 48,
  style,
}: SkeletonPlaceholderProps) {
  const pulse = useRef(new Animated.Value(0.35)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 0.7,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0.35,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [pulse]);

  const resolvedWidth = circle ? size : width;
  const resolvedHeight = circle ? size : height;
  const resolvedRadius = circle ? size / 2 : borderRadius;

  return (
    <Animated.View
      style={[
        {
          width: resolvedWidth,
          height: resolvedHeight,
          borderRadius: resolvedRadius,
          backgroundColor: n.colors.border,
          opacity: pulse,
        },
        style,
      ]}
    />
  );
}
