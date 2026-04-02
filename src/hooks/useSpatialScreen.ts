import { useEffect } from 'react';
import { useIsFocused } from '@react-navigation/native';
import { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';

const SPRING = { damping: 28, stiffness: 220, mass: 0.8 } as const;

/**
 * Spatial Push — outgoing screen "sinks" as the new screen slides over it.
 *
 * Architecture & thread-safety:
 *  - `useIsFocused()` triggers a single React re-render when focus changes.
 *  - The `.value` assignment in `useEffect` schedules a spring on the
 *    Reanimated UI thread.  After that single handoff, zero JS work happens
 *    per animation frame — Reanimated drives every frame natively.
 *  - `useAnimatedStyle` is compiled as a worklet; it never calls back to JS.
 *
 * Usage (any screen that should push-back when navigated away from):
 *
 *   import Animated from 'react-native-reanimated';
 *   import { useSpatialScreen } from '../hooks/useSpatialScreen';
 *
 *   export default function MyScreen() {
 *     const spatialStyle = useSpatialScreen();
 *     return (
 *       <Animated.View style={spatialStyle}>
 *         <SafeAreaView style={styles.safe}>
 *           {... screen content ...}
 *         </SafeAreaView>
 *       </Animated.View>
 *     );
 *   }
 *
 * Pair with `animation: 'slide_from_right'` on the navigator so the *incoming*
 * screen slides in while this one sinks — creating the spatial depth illusion.
 */
export function useSpatialScreen() {
  const focused = useSharedValue(1);
  const isFocused = useIsFocused();

  useEffect(() => {
    // A single write to a SharedValue is the ONLY JS-thread work here.
    // Reanimated picks it up on the UI thread and runs the spring with no
    // further involvement from JS.
    focused.value = withSpring(isFocused ? 1 : 0.935, SPRING);
  }, [isFocused, focused]);

  return useAnimatedStyle(() => {
    'worklet';
    return {
      flex: 1,
      transform: [
        { scale: focused.value },
        // Subtle leftward retreat matches the incoming screen's rightward slide.
        { translateX: (focused.value - 1) * 30 },
      ],
      // Dim slightly so the new screen reads as "above" in depth.
      opacity: 0.55 + focused.value * 0.45,
    };
  });
}
