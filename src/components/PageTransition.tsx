import React from 'react';
import Animated, {
  FadeIn,
  FadeOut,
  SlideInRight,
  SlideOutLeft,
  WithSpringConfig,
} from 'react-native-reanimated';
import { StyleSheet, ViewStyle } from 'react-native';

const SPRING_CONFIG = {
  damping: 25,
  stiffness: 200,
  mass: 1,
};

interface PageTransitionProps {
  children: React.ReactNode;
  style?: ViewStyle;
}

/**
 * Premium, fluid page transition wrapper using Reanimated 4.x.
 * Apply this to the root of your screens and set their stack `animation: 'none'`.
 */
export default function PageTransition({ children, style }: PageTransitionProps) {
  return (
    <Animated.View
      /**
       * Entering: Start slightly offset to the right and lower opacity, 
       * then spring into place.
       */
      entering={SlideInRight.springify()
        .damping(SPRING_CONFIG.damping)
        .stiffness(SPRING_CONFIG.stiffness)
        .mass(SPRING_CONFIG.mass)
        .withInitialValues({ opacity: 0 })}
      style={[styles.container, style]}
    >
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000', // Keeps dark-mode seamless during transit
  },
});
