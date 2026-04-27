/**
 * Unified Loading Overlay Component
 *
 * Provides smooth, professional loading feedback across the app.
 * Uses spring physics for natural, responsive animations.
 *
 * Usage:
 *   <LoadingOverlay visible={isLoading} message={`Planning...`} />
 */

import React, { useEffect, useRef } from 'react';
import { Modal, View, StyleSheet, Pressable } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withSequence,
  withDelay,
  withTiming,
  runOnJS,
  Easing,
  interpolate,
  SharedValue,
} from 'react-native-reanimated';
import { linearTheme as n } from '../theme/linearTheme';
import LinearText from './primitives/LinearText';
import LoadingOrb from './LoadingOrb';

interface LoadingOverlayProps {
  /** Whether the overlay is visible */
  visible: boolean;
  /** Message to display below the loading indicator */
  message?: string;
  /** Optional icon to show (default: animated dot sequence) */
  icon?: React.ReactNode;
  /** Overlay background opacity (default: 0.85) */
  backdropOpacity?: number;
  /** Z-index for the overlay */
  zIndex?: number;
  /** Optional callback when animation completes */
  onDismissed?: () => void;
}

/** Spring configuration for natural, bouncy feel */
const _SPRING_CONFIG = {
  damping: 15,
  stiffness: 150,
  mass: 1,
};

/** Enter animation config */
const ENTER_SPRING = {
  damping: 18,
  stiffness: 200,
  mass: 0.8,
};

/** Exit animation config - faster, less bounce */
const EXIT_SPRING = {
  damping: 25,
  stiffness: 300,
  mass: 0.9,
};

/**
 * Custom hook for dot animation style
 */
function useDotAnimatedStyle(value: SharedValue<number>, _baseSize: number, colorStr: string) {
  return useAnimatedStyle(() => ({
    opacity: interpolate(value.value, [0, 1], [0.35, 1]),
    transform: [{ scale: interpolate(value.value, [0, 0.5, 1], [0.7, 1.15, 1]) }],
    backgroundColor: colorStr,
  }));
}

/**
 * Inline loading indicator for use within components
 * Features spring-based bouncy dots animation
 */
export function InlineLoading({
  message,
  size = 'small',
  color,
}: {
  message?: string;
  size?: 'small' | 'medium';
  color?: string;
}) {
  const dot1 = useSharedValue(0);
  const dot2 = useSharedValue(0);
  const dot3 = useSharedValue(0);
  const accentColor = color ?? n.colors.accent;

  useEffect(() => {
    // Bouncy spring animation for each dot with staggered timing
    const springOpts = { damping: 12, stiffness: 180, mass: 0.5 };

    dot1.value = withSequence(
      withDelay(0, withSpring(1, springOpts)),
      withDelay(100, withSpring(0, { ...springOpts, damping: 20 })),
    );

    dot2.value = withSequence(
      withDelay(150, withSpring(1, springOpts)),
      withDelay(100, withSpring(0, { ...springOpts, damping: 20 })),
    );

    dot3.value = withSequence(
      withDelay(300, withSpring(1, springOpts)),
      withDelay(100, withSpring(0, { ...springOpts, damping: 20 })),
    );

    // Loop the entire sequence
    const loopId = setInterval(() => {
      dot1.value = withSequence(
        withSpring(1, springOpts),
        withDelay(100, withSpring(0, { ...springOpts, damping: 20 })),
      );
      dot2.value = withSequence(
        withDelay(150, withSpring(1, springOpts)),
        withDelay(100, withSpring(0, { ...springOpts, damping: 20 })),
      );
      dot3.value = withSequence(
        withDelay(300, withSpring(1, springOpts)),
        withDelay(100, withSpring(0, { ...springOpts, damping: 20 })),
      );
    }, 1200);

    return () => clearInterval(loopId);
  }, [dot1, dot2, dot3]);

  // Custom hooks for animated styles
  const animatedDotStyle1 = useDotAnimatedStyle(dot1, size === 'medium' ? 10 : 6, accentColor);
  const animatedDotStyle2 = useDotAnimatedStyle(dot2, size === 'medium' ? 10 : 6, accentColor);
  const animatedDotStyle3 = useDotAnimatedStyle(dot3, size === 'medium' ? 10 : 6, accentColor);

  return (
    <View style={styles.inlineContainer}>
      <View style={styles.inlineSpinner}>
        <Animated.View
          style={[styles.dot, size === 'medium' ? styles.dotMedium : null, animatedDotStyle1]}
        />
        <Animated.View
          style={[styles.dot, size === 'medium' ? styles.dotMedium : null, animatedDotStyle2]}
        />
        <Animated.View
          style={[styles.dot, size === 'medium' ? styles.dotMedium : null, animatedDotStyle3]}
        />
      </View>
      {message && (
        <LinearText
          variant={size === 'medium' ? 'body' : 'caption'}
          tone="secondary"
          style={styles.inlineText}
        >
          {message}
        </LinearText>
      )}
    </View>
  );
}

/**
 * Full-screen loading overlay with spring-animated backdrop and content
 */
export default function LoadingOverlay({
  visible,
  message = 'Loading...',
  icon,
  backdropOpacity = 0.85,
  zIndex = 9999,
  onDismissed,
}: LoadingOverlayProps) {
  const backdropOpacityAnim = useSharedValue(0);
  const contentScale = useSharedValue(0.8);
  const contentOpacity = useSharedValue(0);
  const mounted = useRef(true);

  // Animate in/out with spring physics
  useEffect(() => {
    if (visible) {
      backdropOpacityAnim.value = withSpring(1, ENTER_SPRING);
      contentScale.value = withSpring(1, ENTER_SPRING);
      contentOpacity.value = withSpring(1, { ...ENTER_SPRING, damping: 20 });
    } else {
      backdropOpacityAnim.value = withSpring(0, EXIT_SPRING);
      contentScale.value = withSpring(0.9, EXIT_SPRING);
      contentOpacity.value = withTiming(
        0,
        { duration: 150, easing: Easing.out(Easing.quad) },
        () => {
          if (mounted.current && onDismissed) {
            runOnJS(onDismissed)();
          }
        },
      );
    }
  }, [visible, backdropOpacityAnim, contentScale, contentOpacity, onDismissed]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      mounted.current = false;
    };
  }, []);

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacityAnim.value,
  }));

  const contentStyle = useAnimatedStyle(() => ({
    transform: [{ scale: contentScale.value }],
    opacity: contentOpacity.value,
  }));

  return (
    <Modal
      transparent
      visible={visible}
      animationType="none"
      statusBarTranslucent
      supportedOrientations={['portrait']}
    >
      <Pressable style={styles.backdropPressable} onPress={() => {}}>
        <Animated.View
          style={[
            styles.backdrop,
            { backgroundColor: `rgba(0, 0, 0, ${backdropOpacity})`, zIndex },
            backdropStyle,
          ]}
        >
          <Animated.View style={[styles.content, contentStyle]}>
            {icon ?? <LoadingOrb message="" size={140} />}
            {message && (
              <LinearText variant="body" tone="secondary" style={styles.message}>
                {message}
              </LinearText>
            )}
          </Animated.View>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

/**
 * Custom hook for bouncy dot animation style
 */
function useBouncyDotStyle(value: SharedValue<number>) {
  return useAnimatedStyle(() => ({
    opacity: interpolate(value.value, [0, 1], [0.4, 1]),
    transform: [{ scale: interpolate(value.value, [0, 0.6, 1], [0.7, 1.2, 1]) }],
  }));
}

/**
 * Bouncy animated dots with spring physics
 */
function BouncyDots() {
  const dot1 = useSharedValue(0);
  const dot2 = useSharedValue(0);
  const dot3 = useSharedValue(0);

  useEffect(() => {
    const springOpts = { damping: 10, stiffness: 200, mass: 0.4 };

    const animateDots = () => {
      dot1.value = 0;
      dot2.value = 0;
      dot3.value = 0;

      dot1.value = withSequence(
        withSpring(1, springOpts),
        withDelay(80, withSpring(0, { ...springOpts, damping: 18 })),
      );
      dot2.value = withSequence(
        withDelay(120, withSpring(1, springOpts)),
        withDelay(80, withSpring(0, { ...springOpts, damping: 18 })),
      );
      dot3.value = withSequence(
        withDelay(240, withSpring(1, springOpts)),
        withDelay(80, withSpring(0, { ...springOpts, damping: 18 })),
      );
    };

    animateDots();
    const interval = setInterval(animateDots, 1400);
    return () => clearInterval(interval);
  }, [dot1, dot2, dot3]);

  // Custom hooks for animated styles
  const dot1Style = useBouncyDotStyle(dot1);
  const dot2Style = useBouncyDotStyle(dot2);
  const dot3Style = useBouncyDotStyle(dot3);

  return (
    <View style={styles.dotsContainer}>
      <Animated.View style={[styles.animatedDot, dot1Style]} />
      <Animated.View style={[styles.animatedDot, dot2Style]} />
      <Animated.View style={[styles.animatedDot, dot3Style]} />
    </View>
  );
}

const styles = StyleSheet.create({
  backdropPressable: {
    flex: 1,
  },
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    alignItems: 'center',
    padding: 28,
    borderRadius: 20,
    backgroundColor: n.colors.surface,
    borderWidth: 1,
    borderColor: n.colors.border,
    minWidth: 180,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.35,
    shadowRadius: 24,
    elevation: 16,
  },
  message: {
    marginTop: 18,
    textAlign: 'center',
    color: n.colors.textSecondary,
    letterSpacing: 0.3,
  },
  dotsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: 70,
    height: 44,
    gap: 10,
  },
  animatedDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: n.colors.accent,
  },
  inlineContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  inlineSpinner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: n.colors.accent,
  },
  dotMedium: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  inlineText: {
    color: n.colors.textSecondary,
  },
});
