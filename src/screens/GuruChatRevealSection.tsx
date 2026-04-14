import React, { useEffect, useRef } from 'react';
import { Animated, Easing, type StyleProp, type ViewStyle } from 'react-native';
import { useReducedMotion } from '../motion/useReducedMotion';

export function RevealSection({
  active,
  delayMs = 0,
  style,
  children,
}: {
  active: boolean;
  delayMs?: number;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}) {
  const reducedMotion = useReducedMotion();
  const progress = useRef(new Animated.Value(active ? 1 : 0)).current;
  const hasCommittedInitialStateRef = useRef(false);

  useEffect(() => {
    if (!active) {
      hasCommittedInitialStateRef.current = true;
      progress.setValue(0);
      return undefined;
    }

    if (reducedMotion) {
      hasCommittedInitialStateRef.current = true;
      progress.setValue(1);
      return undefined;
    }

    if (!hasCommittedInitialStateRef.current) {
      hasCommittedInitialStateRef.current = true;
      progress.setValue(1);
      return undefined;
    }

    progress.setValue(0);
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: 180,
      delay: delayMs,
      useNativeDriver: true,
      easing: Easing.out(Easing.cubic),
    });
    animation.start();
    return () => animation.stop();
  }, [active, delayMs, progress, reducedMotion]);

  const animatedStyle = {
    opacity: progress,
    transform: [
      {
        translateY: progress.interpolate({
          inputRange: [0, 1],
          outputRange: [12, 0],
        }),
      },
    ],
  };

  return <Animated.View style={[animatedStyle, style]}>{children}</Animated.View>;
}
