/**
 * Navigation Guard Hook - provides safe back navigation with confirmation
 *
 * Usage:
 *   const { canGoBack, safeGoBack, confirmAndGoBack } = useNavigationGuard(navigation);
 *
 *   // In a button handler
 *   const handleBack = () => safeGoBack(() => navigation.navigate('Home'));
 *
 *   // For unsaved changes scenario
 *   const handleBack = () => confirmAndGoBack('Discard changes?', onConfirm, onCancel);
 */

import { useCallback, useRef } from 'react';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { ParamListBase } from '@react-navigation/native';

interface UseNavigationGuardOptions {
  /** Optional confirmation message for unsaved changes */
  confirmationMessage?: string;
  /** Confirmation title */
  confirmationTitle?: string;
  /** Custom confirmation action labels */
  confirmLabel?: string;
  cancelLabel?: string;
}

export function useNavigationGuard<T extends ParamListBase>(
  navigation: NativeStackNavigationProp<T>,
  options: UseNavigationGuardOptions = {},
) {
  const {
    confirmationMessage = 'You have unsaved changes. Are you sure you want to leave?',
    confirmationTitle = 'Discard changes?',
    confirmLabel = 'Discard',
    cancelLabel = 'Keep editing',
  } = options;

  const debounceRef = useRef(false);
  const DEBOUNCE_MS = 500;

  const canGoBack = useCallback(() => {
    return navigation.canGoBack();
  }, [navigation]);

  const safeGoBack = useCallback(
    (onBlocked?: () => void, fallback?: () => void) => {
      // Debounce rapid taps
      if (debounceRef.current) return false;
      debounceRef.current = true;
      setTimeout(() => {
        debounceRef.current = false;
      }, DEBOUNCE_MS);

      if (navigation.canGoBack()) {
        navigation.goBack();
        return true;
      } else if (fallback) {
        fallback();
        return true;
      } else if (onBlocked) {
        onBlocked();
        return false;
      }
      return false;
    },
    [navigation],
  );

  const safeNavigate = useCallback(
    (routeName: string, params?: Record<string, unknown>, onBlocked?: () => void) => {
      // Debounce rapid taps
      if (debounceRef.current) return false;
      debounceRef.current = true;
      setTimeout(() => {
        debounceRef.current = false;
      }, DEBOUNCE_MS);

      try {
        if (params) {
          // @ts-expect-error - dynamic route with string name bypasses typed ParamList
          navigation.navigate(routeName, params);
        } else {
          // @ts-expect-error - dynamic route with string name bypasses typed ParamList
          navigation.navigate(routeName);
        }
        return true;
      } catch (error) {
        // Navigation failed (screen not found, etc.)
        if (__DEV__) {
          console.warn(`[NavigationGuard] Failed to navigate to ${routeName}:`, error);
        }
        if (onBlocked) {
          onBlocked();
        }
        return false;
      }
    },
    [navigation],
  );

  const safePush = useCallback(
    (routeName: string, params?: Record<string, unknown>, onBlocked?: () => void) => {
      // Debounce rapid taps
      if (debounceRef.current) return false;
      debounceRef.current = true;
      setTimeout(() => {
        debounceRef.current = false;
      }, DEBOUNCE_MS);

      try {
        if (params) {
          // @ts-expect-error - dynamic route with string name bypasses typed ParamList
          navigation.push(routeName, params);
        } else {
          // @ts-expect-error - dynamic route with string name bypasses typed ParamList
          navigation.push(routeName);
        }
        return true;
      } catch (error) {
        if (__DEV__) {
          console.warn(`[NavigationGuard] Failed to push ${routeName}:`, error);
        }
        if (onBlocked) {
          onBlocked();
        }
        return false;
      }
    },
    [navigation],
  );

  const safePop = useCallback(
    (count: number = 1) => {
      try {
        navigation.pop(count);
        return true;
      } catch (error) {
        if (__DEV__) {
          console.warn(`[NavigationGuard] Failed to pop ${count}:`, error);
        }
        return false;
      }
    },
    [navigation],
  );

  const safePopToTop = useCallback(() => {
    try {
      navigation.popToTop();
      return true;
    } catch (error) {
      if (__DEV__) {
        console.warn('[NavigationGuard] Failed to pop to top:', error);
      }
      return false;
    }
  }, [navigation]);

  return {
    canGoBack,
    safeGoBack,
    safeNavigate,
    safePush,
    safePop,
    safePopToTop,
    confirmationMessage,
    confirmationTitle,
    confirmLabel,
    cancelLabel,
  };
}
