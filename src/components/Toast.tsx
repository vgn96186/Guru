/**
 * Lightweight in-app toast notification for Guru.
 *
 * Usage (imperative — no Provider needed):
 *   import { showToast } from '../components/Toast';
 *
 *   showToast('Lecture saved!');
 *   showToast('Recording failed. Tap to retry.', 'error', onTap);
 *
 * Mount <ToastContainer /> once near the root of your screen tree
 * (or in App.tsx alongside the NavigationContainer).
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Animated, TouchableOpacity, StyleSheet, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '../constants/theme';
import LinearText from './primitives/LinearText';

export type ToastType = 'info' | 'success' | 'error' | 'warning' | 'focus';
export type ToastVariant = ToastType;

interface ToastPayload {
  title?: string;
  message: string;
  type: ToastType;
  duration: number;
  onPress?: () => void;
  id: number;
}

export interface ToastOptions {
  title?: string;
  message: string;
  variant?: ToastVariant;
  onPress?: () => void;
  duration?: number;
}

type ToastListener = (payload: ToastPayload) => void;
let _listener: ToastListener | null = null;
let _idCounter = 0;

/**
 * Show a toast message.
 * @param message - Text to display.
 * @param type - Visual style: 'info' (default) | 'success' | 'error' | 'warning'
 * @param onPress - Optional tap handler.
 * @param duration - Auto-dismiss delay in ms (default 3500).
 */
export function showToast(
  messageOrOptions: string | ToastOptions,
  type: ToastType = 'info',
  onPress?: () => void,
  duration = 3500,
): void {
  const payload =
    typeof messageOrOptions === 'string'
      ? {
          message: messageOrOptions,
          type,
          onPress,
          duration,
          id: ++_idCounter,
        }
      : {
          title: messageOrOptions.title,
          message: messageOrOptions.message,
          type: messageOrOptions.variant ?? 'info',
          onPress: messageOrOptions.onPress,
          duration: messageOrOptions.duration ?? 3500,
          id: ++_idCounter,
        };

  if (_listener) {
    _listener(payload);
  } else {
    // Fallback if ToastContainer is not mounted yet
    console.warn(`[Toast] ${payload.type.toUpperCase()}: ${payload.message}`);
  }
}

export function __resetToastForTests(): void {
  _listener = null;
  _idCounter = 0;
}

const TOAST_STYLES: Record<
  ToastType,
  {
    borderColor: string;
    backgroundColor: string;
    textColor: string;
    hintColor: string;
    pillColor: string;
    pillTextColor: string;
  }
> = {
  info: {
    borderColor: theme.colors.info,
    backgroundColor: theme.colors.panel,
    textColor: theme.colors.textPrimary,
    hintColor: theme.colors.textSecondary,
    pillColor: theme.colors.primaryTintSoft,
    pillTextColor: theme.colors.info,
  },
  success: {
    borderColor: theme.colors.success,
    backgroundColor: theme.colors.panel,
    textColor: theme.colors.textPrimary,
    hintColor: theme.colors.textSecondary,
    pillColor: theme.colors.successTintSoft,
    pillTextColor: theme.colors.success,
  },
  error: {
    borderColor: theme.colors.error,
    backgroundColor: theme.colors.panel,
    textColor: theme.colors.textPrimary,
    hintColor: theme.colors.textSecondary,
    pillColor: theme.colors.errorTintSoft,
    pillTextColor: theme.colors.error,
  },
  warning: {
    borderColor: theme.colors.warning,
    backgroundColor: theme.colors.panel,
    textColor: theme.colors.textPrimary,
    hintColor: theme.colors.textSecondary,
    pillColor: theme.colors.warningTintSoft,
    pillTextColor: theme.colors.warning,
  },
  focus: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.panel,
    textColor: theme.colors.textPrimary,
    hintColor: theme.colors.textSecondary,
    pillColor: theme.colors.primaryTintSoft,
    pillTextColor: theme.colors.primaryLight,
  },
};

const ToastItem = React.memo(
  ({ payload, onDone }: { payload: ToastPayload; onDone: () => void }) => {
    const opacity = useRef(new Animated.Value(0)).current;
    const translateY = useRef(new Animated.Value(-20)).current;
    const palette = TOAST_STYLES[payload.type];

    useEffect(() => {
      if (payload.type === 'error') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      } else if (payload.type === 'warning') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      } else if (payload.type === 'success') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
      Animated.parallel([
        Animated.spring(opacity, { toValue: 1, useNativeDriver: true }),
        Animated.spring(translateY, { toValue: 0, useNativeDriver: true }),
      ]).start();

      const timer = setTimeout(() => {
        Animated.parallel([
          Animated.timing(opacity, { toValue: 0, duration: 250, useNativeDriver: true }),
          Animated.timing(translateY, { toValue: -20, duration: 250, useNativeDriver: true }),
        ]).start(() => onDone());
      }, payload.duration);

      return () => clearTimeout(timer);
    }, [opacity, translateY, payload.duration, payload.type, onDone]);

    return (
      <Animated.View
        style={[
          styles.toast,
          {
            backgroundColor: palette.backgroundColor,
            borderColor: palette.borderColor,
            opacity,
            transform: [{ translateY }],
          },
        ]}
      >
        <TouchableOpacity
          onPress={() => {
            payload.onPress?.();
            onDone();
          }}
          activeOpacity={payload.onPress ? 0.7 : 1}
          style={styles.inner}
          accessibilityLabel={payload.message}
          accessibilityRole={payload.onPress ? 'button' : 'alert'}
          accessibilityHint={payload.onPress ? 'Double tap to act' : undefined}
        >
          <View style={styles.content}>
            <View style={[styles.badge, { backgroundColor: palette.pillColor }]}>
              <LinearText
                variant="badge"
                tone={
                  payload.type === 'success'
                    ? 'success'
                    : payload.type === 'error'
                    ? 'error'
                    : payload.type === 'warning'
                    ? 'warning'
                    : payload.type === 'focus'
                    ? 'accent'
                    : 'secondary'
                }
                style={styles.badgeText}
              >
                {payload.type.toUpperCase()}
              </LinearText>
            </View>
            {payload.title ? (
              <LinearText variant="title" tone="primary" style={styles.title} numberOfLines={2}>
                {payload.title}
              </LinearText>
            ) : null}
            <LinearText variant="bodySmall" tone="primary" style={styles.text} numberOfLines={3}>
              {payload.message}
            </LinearText>
          </View>
          {payload.onPress && (
            <LinearText variant="caption" tone="secondary" style={styles.tapHint}>
              Tap to act
            </LinearText>
          )}
        </TouchableOpacity>
      </Animated.View>
    );
  },
);

/**
 * Mount this component once near your app root.
 * It registers as the global toast listener.
 */
export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastPayload[]>([]);
  const insets = useSafeAreaInsets();

  const addToast = useCallback((payload: ToastPayload) => {
    setToasts((prev) => [...prev.slice(-2), payload]); // max 3 visible
  }, []);

  useEffect(() => {
    _listener = addToast;
    return () => {
      _listener = null;
    };
  }, [addToast]);

  return (
    <Animated.View pointerEvents="box-none" style={[styles.container, { top: insets.top + 12 }]}>
      {toasts.map((t) => (
        <ToastItem
          key={t.id}
          payload={t}
          onDone={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}
        />
      ))}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 9999,
    alignItems: 'center',
  },
  toast: {
    width: '100%',
    alignSelf: 'stretch',
    borderRadius: theme.borderRadius.lg,
    marginTop: 8,
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: theme.colors.backdropStrong,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.22,
    shadowRadius: 18,
    elevation: 8,
  },
  inner: {
    padding: theme.spacing.lg,
  },
  content: {
    gap: theme.spacing.sm,
  },
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 4,
    borderRadius: theme.borderRadius.full,
    marginBottom: 2,
  },
  badgeText: {
    ...theme.typography.captionSmall,
    letterSpacing: 0.6,
  },
  title: {
    ...theme.typography.h4,
  },
  text: {
    ...theme.typography.bodySmall,
    lineHeight: 20,
  },
  tapHint: {
    ...theme.typography.caption,
    marginTop: theme.spacing.sm,
  },
});
