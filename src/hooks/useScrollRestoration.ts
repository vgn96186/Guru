import { useCallback, useEffect, useRef, useState } from 'react';
import { useIsFocused } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Persist and restore scroll position for FlatList/ScrollView across app backgrounding.
 *
 * Usage:
 *   const { onScroll, onContentSizeChange, listRef } = useScrollRestoration('notes-vault');
 *   <FlatList ref={listRef} onScroll={onScroll} onContentSizeChange={onContentSizeChange} ... />
 */
export function useScrollRestoration(key: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic/trusted type
  const listRef = useRef<any>(null);
  const isFocused = useIsFocused();
  const scrollY = useRef(0);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined!);

  const saveScrollPosition = useCallback(async () => {
    if (scrollY.current > 0) {
      try {
        await AsyncStorage.setItem(`@scroll:${key}`, String(scrollY.current));
      } catch {
        // silent
      }
    }
  }, [key]);

  // Restore on mount / focus
  useEffect(() => {
    if (!isFocused || !listRef.current) return;

    const restore = async () => {
      try {
        const saved = await AsyncStorage.getItem(`@scroll:${key}`);
        if (saved && listRef.current) {
          const y = parseInt(saved, 10);
          if (y > 0) {
            setTimeout(() => {
              listRef.current?.scrollToOffset?.({ offset: y, animated: false });
              listRef.current?.scrollTo?.({ y, animated: false });
            }, 200);
          }
        }
      } catch {
        // silent
      }
    };
    restore();
  }, [key, isFocused]);

  // Save on blur
  useEffect(() => {
    if (!isFocused) {
      void saveScrollPosition();
    }
  }, [isFocused, saveScrollPosition]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic/trusted type
  const onScroll = useCallback((event: any) => {
    scrollY.current = event.nativeEvent.contentOffset.y;
  }, []);

  const onContentSizeChange = useCallback(() => {
    if (scrollY.current === 0) {
      saveTimerRef.current = setTimeout(() => {
        void saveScrollPosition();
      }, 300);
    }
  }, [saveScrollPosition]);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  return { onScroll, onContentSizeChange, listRef };
}

/**
 * Persist a text input value across app backgrounding.
 *
 * Usage:
 *   const [search, setSearch] = usePersistedInput('notes-vault-search', '');
 */
export function usePersistedInput(
  key: string,
  initialValue: string = '',
): [string, (v: string) => void] {
  const [value, setValue] = useState(initialValue);
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    const load = async () => {
      try {
        const saved = await AsyncStorage.getItem(`@input:${key}`);
        if (saved !== null) setValue(saved);
      } catch {
        // silent
      }
    };
    void load();
  }, [key]);

  const saveRef = useRef<ReturnType<typeof setTimeout>>(undefined!);

  const setAndSave = useCallback(
    (next: string) => {
      setValue(next);
      if (saveRef.current) clearTimeout(saveRef.current);
      saveRef.current = setTimeout(async () => {
        try {
          await AsyncStorage.setItem(`@input:${key}`, next);
        } catch {
          // silent
        }
      }, 300);
    },
    [key],
  );

  useEffect(() => {
    return () => {
      if (saveRef.current) clearTimeout(saveRef.current);
    };
  }, []);

  return [value, setAndSave];
}
