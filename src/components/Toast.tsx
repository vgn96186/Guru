/**
 * Lightweight in-app toast notification for Guru.
 *
 * Usage (imperative — no Provider needed):
 *   import { theme } from '../constants/theme';
import { showToast } from '../components/Toast';
 *
 *   showToast('Lecture saved!');
 *   showToast('Recording failed. Tap to retry.', 'error', onTap);
 *
 * Mount <ToastContainer /> once near the root of your screen tree
 * (or in App.tsx alongside the NavigationContainer).
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Animated, Text, TouchableOpacity, StyleSheet, Dimensions,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export type ToastType = 'info' | 'success' | 'error' | 'warning';

interface ToastPayload {
  message: string;
  type: ToastType;
  duration: number;
  onPress?: () => void;
  id: number;
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
  message: string,
  type: ToastType = 'info',
  onPress?: () => void,
  duration = 3500,
): void {
  if (_listener) {
    _listener({ message, type, duration, onPress, id: ++_idCounter });
  } else {
    // Fallback if ToastContainer is not mounted yet
    console.warn(`[Toast] ${type.toUpperCase()}: ${message}`);
  }
}

const COLORS: Record<ToastType, string> = {
  info: '#6C63FF',
  success: '#4CAF50',
  error: '#F44336',
  warning: '#FF9800',
};

const WIDTH = Dimensions.get('window').width - 32;

const ToastItem = React.memo(({ payload, onDone }: { payload: ToastPayload; onDone: () => void }) => {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(20)).current;

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
        Animated.timing(translateY, { toValue: 20, duration: 250, useNativeDriver: true }),
      ]).start(() => onDone());
    }, payload.duration);

    return () => clearTimeout(timer);
  }, []);

  return (
    <Animated.View
      style={[
        styles.toast,
        { backgroundColor: COLORS[payload.type], opacity, transform: [{ translateY }] },
      ]}
    >
      <TouchableOpacity
        onPress={() => { payload.onPress?.(); onDone(); }}
        activeOpacity={payload.onPress ? 0.7 : 1}
        style={styles.inner}
        accessibilityRole="alert"
        accessibilityLabel={payload.message}
      >
        <Text style={styles.text} numberOfLines={3}>{payload.message}</Text>
        {payload.onPress && (
          <Text style={styles.tapHint}>Tap to act</Text>
        )}
      </TouchableOpacity>
    </Animated.View>
  );
});

/**
 * Mount this component once near your app root.
 * It registers as the global toast listener.
 */
export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastPayload[]>([]);
  const insets = useSafeAreaInsets();

  const addToast = useCallback((payload: ToastPayload) => {
    setToasts(prev => [...prev.slice(-2), payload]); // max 3 visible
  }, []);

  useEffect(() => {
    _listener = addToast;
    return () => { _listener = null; };
  }, [addToast]);

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[styles.container, { bottom: insets.bottom + theme.spacing.xl }]}
    >
      {toasts.map(t => (
        <ToastItem
          key={t.id}
          payload={t}
          onDone={() => setToasts(prev => prev.filter(x => x.id !== t.id))}
        />
      ))}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: theme.spacing.xl,
    right: theme.spacing.xl,
    zIndex: 9999,
    alignItems: 'center',
  },
  toast: {
    width: WIDTH,
    borderRadius: theme.radius.pill,
    marginTop: 8,
    ...theme.shadows.floating,
  },
  inner: {
    paddingVertical: theme.spacing.md, paddingHorizontal: theme.spacing.xl,
  },
  text: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
  },
  tapHint: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 12,
    marginTop: 4,
  },
});
