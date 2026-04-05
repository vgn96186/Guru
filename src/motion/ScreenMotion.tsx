import React, { useEffect, useRef, useState } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { screenEnterTiming, screenSettleTiming, type ScreenMotionTrigger } from './presets';
import { useReducedMotion } from './useReducedMotion';

type ScreenMotionPhase = 'first-mount' | 'focus-settle';

const NORMAL_START = {
  'first-mount': { opacity: 0, translateX: 16, translateY: 12, scale: 0.985 },
  'focus-settle': { opacity: 0.92, translateX: 0, translateY: 6, scale: 0.995 },
} as const;

const REDUCED_START = {
  'first-mount': { opacity: 0, translateX: 0, translateY: 8, scale: 1 },
  'focus-settle': { opacity: 0.94, translateX: 0, translateY: 4, scale: 1 },
} as const;

export interface ScreenMotionProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  trigger?: ScreenMotionTrigger;
  isFocused?: boolean;
  isEntryComplete?: () => void;
}

type ScreenMotionBaseProps = Omit<ScreenMotionProps, 'isFocused'> & {
  isFocused: boolean;
};

function ScreenMotionBase({
  children,
  style,
  trigger = 'first-mount',
  isFocused,
  isEntryComplete,
}: ScreenMotionBaseProps) {
  const reducedMotion = useReducedMotion();
  const isManual = trigger === 'manual';
  const progress = useSharedValue(isFocused && !isManual ? 0 : 1);
  const playedInitialMountRef = useRef(false);
  const completionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isEntryCompleteRef = useRef(isEntryComplete);
  const [currentPhase, setCurrentPhase] = useState<ScreenMotionPhase>(
    trigger === 'focus-settle' ? 'focus-settle' : 'first-mount',
  );

  useEffect(() => {
    isEntryCompleteRef.current = isEntryComplete;
  }, [isEntryComplete]);

  useEffect(() => {
    setCurrentPhase(trigger === 'focus-settle' ? 'focus-settle' : 'first-mount');
  }, [trigger]);

  useEffect(() => {
    if (completionTimerRef.current) {
      clearTimeout(completionTimerRef.current);
      completionTimerRef.current = null;
    }

    if (isManual) {
      if (isFocused) {
        isEntryCompleteRef.current?.();
      }
      return undefined;
    }

    if (!isFocused) {
      return undefined;
    }

    const nextPhase: ScreenMotionPhase =
      trigger === 'focus-settle' || playedInitialMountRef.current ? 'focus-settle' : 'first-mount';

    setCurrentPhase(nextPhase);
    progress.value = 0;

    const duration = reducedMotion
      ? nextPhase === 'first-mount'
        ? 120
        : 90
      : nextPhase === 'first-mount'
        ? screenEnterTiming.duration
        : screenSettleTiming.duration;

    progress.value = withTiming(1, {
      duration,
      easing: Easing.out(Easing.cubic),
    });

    completionTimerRef.current = setTimeout(() => {
      playedInitialMountRef.current = true;
      completionTimerRef.current = null;
      isEntryCompleteRef.current?.();
    }, duration);

    return () => {
      if (completionTimerRef.current) {
        clearTimeout(completionTimerRef.current);
        completionTimerRef.current = null;
      }
    };
  }, [isFocused, isManual, progress, reducedMotion, trigger]);

  const animatedStyle = useAnimatedStyle(() => {
    const start = reducedMotion ? REDUCED_START[currentPhase] : NORMAL_START[currentPhase];
    const delta = 1 - progress.value;

    return {
      opacity: interpolate(progress.value, [0, 1], [start.opacity, 1]),
      transform: [
        { translateX: start.translateX * delta },
        { translateY: start.translateY * delta },
        { scale: interpolate(progress.value, [0, 1], [start.scale, 1]) },
      ],
    };
  }, [currentPhase, reducedMotion, progress]);

  return <Animated.View style={[animatedStyle, style]}>{children}</Animated.View>;
}

function FocusAwareScreenMotion(props: ScreenMotionProps) {
  const navigationIsFocused = useIsFocused();

  return <ScreenMotionBase {...props} isFocused={navigationIsFocused} />;
}

export default function ScreenMotion(props: ScreenMotionProps) {
  if (props.isFocused === undefined) {
    return <FocusAwareScreenMotion {...props} />;
  }

  return <ScreenMotionBase {...props} isFocused={props.isFocused} />;
}
