import { useRef, useState, useCallback, useEffect } from 'react';
import { PanResponder } from 'react-native';
import { useAppStateTransition } from './useAppStateTransition';

interface UseIdleTimerProps {
  onIdle: () => void;
  onActive?: () => void;
  timeout: number; // ms
  disabled?: boolean;
}

export function useIdleTimer({ onIdle, onActive, timeout, disabled }: UseIdleTimerProps) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isIdle, setIsIdle] = useState(false);
  const isIdleRef = useRef(false);

  useEffect(() => {
    isIdleRef.current = isIdle;
  }, [isIdle]);

  const onIdleRef = useRef(onIdle);
  const onActiveRef = useRef(onActive);
  useEffect(() => {
    onIdleRef.current = onIdle;
  }, [onIdle]);
  useEffect(() => {
    onActiveRef.current = onActive;
  }, [onActive]);

  const resetTimer = useCallback(() => {
    if (disabled) return;
    if (isIdleRef.current) {
      setIsIdle(false);
      onActiveRef.current?.();
    }
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setIsIdle(true);
      onIdleRef.current();
    }, timeout);
  }, [disabled, timeout]);

  useAppStateTransition({
    onBackground: () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (!isIdleRef.current) {
        setIsIdle(true);
        onIdleRef.current();
      }
    },
    onForeground: () => {
      resetTimer();
    },
  });

  // Initial start and cleanup
  useEffect(() => {
    resetTimer();
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [resetTimer]);

  // Keep a ref to the latest resetTimer to avoid stale closures in PanResponder
  const resetTimerRef = useRef(resetTimer);
  useEffect(() => {
    resetTimerRef.current = resetTimer;
  }, [resetTimer]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponderCapture: () => {
        resetTimerRef.current();
        return false;
      },
      onMoveShouldSetPanResponderCapture: () => {
        resetTimerRef.current();
        return false;
      },
    }),
  ).current;

  return {
    panHandlers: panResponder.panHandlers,
    isIdle,
  };
}
