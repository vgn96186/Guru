import { useEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';

interface UseAppStateTransitionOptions {
  enabled?: boolean;
  onChange?: (nextState: AppStateStatus, prevState: AppStateStatus) => void;
  onActive?: (prevState: AppStateStatus) => void;
  onForeground?: (prevState: AppStateStatus) => void;
  onBackground?: (nextState: AppStateStatus) => void;
}

export function useAppStateTransition({
  enabled = true,
  onChange,
  onActive,
  onForeground,
  onBackground,
}: UseAppStateTransitionOptions): void {
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const onChangeRef = useRef(onChange);
  const onActiveRef = useRef(onActive);
  const onForegroundRef = useRef(onForeground);
  const onBackgroundRef = useRef(onBackground);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    onActiveRef.current = onActive;
  }, [onActive]);

  useEffect(() => {
    onForegroundRef.current = onForeground;
  }, [onForeground]);

  useEffect(() => {
    onBackgroundRef.current = onBackground;
  }, [onBackground]);

  useEffect(() => {
    if (!enabled) return;

    const subscription = AppState.addEventListener('change', (nextState) => {
      const prevState = appStateRef.current;

      onChangeRef.current?.(nextState, prevState);

      if (nextState === 'active' && prevState !== 'active') {
        onActiveRef.current?.(prevState);
      }

      if (prevState.match(/inactive|background/) && nextState === 'active') {
        onForegroundRef.current?.(prevState);
      }

      if (prevState.match(/active/) && nextState.match(/inactive|background/)) {
        onBackgroundRef.current?.(nextState);
      }

      appStateRef.current = nextState;
    });

    return () => subscription.remove();
  }, [enabled]);
}
