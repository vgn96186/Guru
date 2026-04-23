import { useEffect, useRef } from 'react';
import { Animated, InteractionManager } from 'react-native';
import { motion } from '../motion';

export function useEntranceAnimation(duration = 400) {
  const fade = useRef(new Animated.Value(0)).current;
  const slide = useRef(new Animated.Value(24)).current;
  useEffect(() => {
    fade.setValue(0);
    slide.setValue(24);
    InteractionManager.runAfterInteractions(() => {
      Animated.parallel([
        motion.to(fade, { toValue: 1, duration, useNativeDriver: true }),
        motion.to(slide, { toValue: 0, duration, useNativeDriver: true }),
      ]).start();
    });
  }, [duration, fade, slide]);
  return { fade, slide };
}
