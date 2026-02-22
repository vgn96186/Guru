import { useRef, useState, useCallback, useEffect } from 'react';
import { AppState, AppStateStatus, PanResponder } from 'react-native';

interface UseIdleTimerProps {
  onIdle: () => void;
  onActive?: () => void;
  timeout: number; // ms
  disabled?: boolean;
}

export function useIdleTimer({ onIdle, onActive, timeout, disabled }: UseIdleTimerProps) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isIdle, setIsIdle] = useState(false);
  const appState = useRef<AppStateStatus>(AppState.currentState);

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

  // Handle app state changes (background/foreground)
  useEffect(() => {
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (
        appState.current.match(/active/) &&
        nextAppState.match(/inactive|background/)
      ) {
        // App going to background - treat as idle
        resetTimer();
      } else if (
        appState.current.match(/inactive|background/) &&
        nextAppState === 'active'
      ) {
        // App coming to foreground - reset timer
        resetTimer();
      }
      appState.current = nextAppState;
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription.remove();
  }, [resetTimer]);

  // Initial start and cleanup
  useEffect(() => {
    resetTimer();
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [resetTimer]);

  // Keep a ref to the latest resetTimer to avoid stale closures in PanResponder
  const resetTimerRef = useRef(resetTimer);
  useEffect(() => { resetTimerRef.current = resetTimer; }, [resetTimer]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponderCapture: () => { resetTimerRef.current(); return false; },
      onMoveShouldSetPanResponderCapture: () => { resetTimerRef.current(); return false; },
    }),
  ).current;

  return {
    panHandlers: panResponder.panHandlers,
    isIdle,
  };
}
