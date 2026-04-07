/**
 * ResilientImage — drop-in replacement for React Native <Image> that handles
 * transient failures gracefully.
 *
 * Uses <Image onLoad/onError> directly instead of Image.prefetch(), because
 * prefetch() sends a bare User-Agent that gets 403'd by Wikimedia, OpenI, etc.
 * The <Image> component respects source.headers, so we inject a browser-like UA.
 *
 * Features:
 *  - Retry with exponential backoff (up to 2 retries: 1s, 3s).
 *  - Graceful fallback: shows a placeholder on persistent failure.
 *  - Proper User-Agent header for image hosts that require it.
 */
import React, { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  View,
  type ImageStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { linearTheme as n } from '../theme/linearTheme';
import LinearText from '../components/primitives/LinearText';

// Browser-like User-Agent to satisfy Wikimedia, OpenI, and similar hosts
const IMAGE_USER_AGENT =
  'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36';

const MAX_RETRIES = 2;
const RETRY_DELAYS_MS = [1000, 3000];

// ─── Component ───────────────────────────────────────────────────────────────
export interface ResilientImageProps {
  uri: string;
  style?: ImageStyle | ImageStyle[];
  resizeMode?: 'contain' | 'cover' | 'stretch' | 'repeat' | 'center';
  onPress?: () => void;
  onLongPress?: () => void;
  accessibilityLabel?: string;
  /** Show a small "retry" button when load fails. Default: true */
  showRetry?: boolean;
  /** Custom fallback content when image fails. Overrides built-in fallback. */
  fallback?: React.ReactNode;
}

export function ResilientImage({
  uri,
  style,
  resizeMode = 'contain',
  onPress,
  onLongPress,
  accessibilityLabel,
  showRetry = true,
  fallback,
}: ResilientImageProps) {
  const [status, setStatus] = useState<'loading' | 'loaded' | 'failed'>('loading');
  const [retryKey, setRetryKey] = useState(0);
  const attemptsRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const safeUri = typeof uri === 'string' ? uri.trim() : '';
  if (!safeUri || !/^https?:\/\//i.test(safeUri)) {
    return null;
  }

  const handleLoad = useCallback(() => {
    attemptsRef.current = 0;
    setStatus('loaded');
  }, []);

  const handleError = useCallback(() => {
    const attempt = attemptsRef.current;
    if (attempt < MAX_RETRIES) {
      const delay = RETRY_DELAYS_MS[Math.min(attempt, RETRY_DELAYS_MS.length - 1)];
      attemptsRef.current = attempt + 1;
      // Schedule a retry by bumping retryKey after delay
      retryTimerRef.current = setTimeout(() => {
        setStatus('loading');
        setRetryKey((k) => k + 1);
      }, delay);
    } else {
      setStatus('failed');
    }
  }, []);

  const handleManualRetry = useCallback(() => {
    attemptsRef.current = 0;
    setStatus('loading');
    setRetryKey((k) => k + 1);
  }, []);

  const imageSource = {
    uri: safeUri,
    headers: { 'User-Agent': IMAGE_USER_AGENT },
    cache: 'default' as const,
  };

  const content = () => {
    if (status === 'loaded') {
      return (
        <Image
          key={retryKey}
          source={imageSource}
          style={style}
          resizeMode={resizeMode}
          accessibilityLabel={accessibilityLabel}
          onLoad={handleLoad}
          onError={handleError}
        />
      );
    }

    if (status === 'failed') {
      if (fallback) {
        return <>{fallback}</>;
      }
      return (
        <View style={[styles.fallbackContainer, style]}>
          <Ionicons name="image-outline" size={20} color={n.colors.error} />
          {showRetry && (
            <Pressable
              onPress={handleManualRetry}
              style={styles.retryButton}
              accessibilityLabel="Retry loading image"
            >
              <Ionicons name="refresh" size={12} color={n.colors.textSecondary} />
              <LinearText style={styles.retryText}>Retry</LinearText>
            </Pressable>
          )}
        </View>
      );
    }

    // Loading — render the Image invisibly so RN starts the fetch,
    // with a spinner overlay.
    return (
      <View style={[styles.loadingContainer, style]}>
        <Image
          key={retryKey}
          source={imageSource}
          style={StyleSheet.absoluteFill}
          resizeMode={resizeMode}
          onLoad={handleLoad}
          onError={handleError}
        />
        <ActivityIndicator size="small" color={n.colors.accent} />
      </View>
    );
  };

  const containerStyle = [
    styles.container,
    {
      justifyContent: 'center' as const,
      alignItems: 'center' as const,
      backgroundColor: n.colors.surface,
      overflow: 'hidden' as const,
    },
  ];

  if (onPress || onLongPress) {
    return (
      <Pressable
        onPress={onPress}
        onLongPress={onLongPress}
        delayLongPress={250}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        style={containerStyle}
      >
        {content()}
      </Pressable>
    );
  }

  return <View style={containerStyle}>{content()}</View>;
}

const styles = StyleSheet.create({
  container: {},
  loadingContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  fallbackContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    gap: 4,
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  retryText: {
    fontSize: 10,
    color: n.colors.textSecondary,
  },
});
