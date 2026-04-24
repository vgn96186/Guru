/**
 * Shared button feedback hook — provides consistent haptic + visual feedback
 * for all interactive buttons across the app.
 *
 * Usage:
 *   const { onPressIn, onPressOut } = useButtonFeedback({ enabled: true });
 *   <Pressable onPressIn={onPressIn} onPressOut={onPressOut} ...>
 */

import { useCallback, useRef } from 'react';
import * as Haptics from 'expo-haptics';

interface UseButtonFeedbackOptions {
  /** Enable haptic feedback (default: true) */
  enabled?: boolean;
  /** Haptic style: 'light' | 'medium' | 'heavy' (default: 'light') */
  intensity?: 'light' | 'medium' | 'heavy';
  /** Callback when press starts */
  onPressStart?: () => void;
  /** Callback when press ends */
  onPressEnd?: () => void;
}

export function useButtonFeedback(options: UseButtonFeedbackOptions = {}) {
  const { enabled = true, intensity = 'light', onPressStart, onPressEnd } = options;
  const lastHapticTime = useRef(0);
  const THROTTLE_MS = 50; // Prevent haptic spam

  const triggerHaptic = useCallback(() => {
    if (!enabled) return;
    const now = Date.now();
    if (now - lastHapticTime.current < THROTTLE_MS) return;
    lastHapticTime.current = now;

    switch (intensity) {
      case 'heavy':
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        break;
      case 'medium':
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        break;
      case 'light':
      default:
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        break;
    }
  }, [enabled, intensity]);

  const onPressIn = useCallback(() => {
    triggerHaptic();
    onPressStart?.();
  }, [triggerHaptic, onPressStart]);

  const onPressOut = useCallback(() => {
    onPressEnd?.();
  }, [onPressEnd]);

  return {
    onPressIn,
    onPressOut,
    triggerHaptic, // For manual triggering
  };
}

/**
 * Haptic notification helper — for async operation completion
 */
export function useHapticNotification() {
  const lastNotificationTime = useRef(0);
  const THROTTLE_MS = 200;

  const success = useCallback(() => {
    const now = Date.now();
    if (now - lastNotificationTime.current < THROTTLE_MS) return;
    lastNotificationTime.current = now;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, []);

  const error = useCallback(() => {
    const now = Date.now();
    if (now - lastNotificationTime.current < THROTTLE_MS) return;
    lastNotificationTime.current = now;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  }, []);

  const warning = useCallback(() => {
    const now = Date.now();
    if (now - lastNotificationTime.current < THROTTLE_MS) return;
    lastNotificationTime.current = now;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
  }, []);

  return { success, error, warning };
}
