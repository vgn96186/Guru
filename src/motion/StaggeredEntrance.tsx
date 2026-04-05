import React from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { sectionEnterTiming, sectionStaggerMs } from './presets';
import { useReducedMotion } from './useReducedMotion';

export interface StaggeredEntranceProps {
  children: React.ReactNode;
  index?: number;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

/**
 * Use this only for above-the-fold sections. Long lists should stay outside the stagger chain.
 */
export default function StaggeredEntrance({
  children,
  index = 0,
  disabled = false,
  style,
}: StaggeredEntranceProps) {
  const reducedMotion = useReducedMotion();

  if (disabled || reducedMotion) {
    return <View style={style}>{children}</View>;
  }

  const entering = FadeIn.duration(sectionEnterTiming.duration)
    .delay(index * sectionStaggerMs)
    .withInitialValues({
      opacity: 0,
      transform: [{ translateY: 12 }],
    });

  return (
    <Animated.View entering={entering} style={style}>
      {children}
    </Animated.View>
  );
}
