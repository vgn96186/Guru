import { useRef, useState, useCallback, useEffect } from 'react';
import { PanResponder, PanResponderGestureState } from 'react-native';

interface UseIdleTimerProps {
  onIdle: () => void;
  onActive?: () => void;
  timeout: number; // ms
  disabled?: boolean;
}

export function useIdleTimer({ onIdle, onActive, timeout, disabled }: UseIdleTimerProps) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isIdle, setIsIdle] = useState(false);

  const resetTimer = useCallback(() => {
    if (disabled) return;
    if (isIdle) {
      setIsIdle(false);
      onActive?.();
    }
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setIsIdle(true);
      onIdle();
    }, timeout);
  }, [disabled, isIdle, onIdle, onActive, timeout]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onStartShouldSetPanResponderCapture: () => {
        resetTimer();
        return false; // Don't capture, let children handle touch
      },
      onMoveShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponderCapture: () => {
        resetTimer();
        return false;
      },
      onPanResponderGrant: () => resetTimer(),
      onPanResponderMove: () => resetTimer(),
      onPanResponderRelease: () => resetTimer(),
      onPanResponderTerminate: () => resetTimer(),
    })
  ).current;

  // Initial start
  useEffect(() => {
    resetTimer();
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [resetTimer]);

  return { panResponder, isIdle };
}
