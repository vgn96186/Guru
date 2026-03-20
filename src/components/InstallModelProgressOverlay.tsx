import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import type { DimensionValue } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '../constants/theme';
import {
  clearLocalModelDownload,
  getLocalModelDownloadSnapshot,
  subscribeToLocalModelDownload,
  type LocalModelDownloadSnapshot,
} from '../services/localModelDownloadState';

function formatBytes(bytes?: number): string | null {
  if (!bytes || bytes <= 0) return null;
  const gb = bytes / 1_000_000_000;
  if (gb >= 1) return `${gb.toFixed(gb >= 10 ? 0 : 1)} GB`;
  const mb = bytes / 1_000_000;
  return `${Math.round(mb)} MB`;
}

function getStageLabel(snapshot: LocalModelDownloadSnapshot): string {
  if (snapshot.message) return snapshot.message;
  if (snapshot.stage === 'verifying') return 'Verifying model integrity';
  if (snapshot.stage === 'complete') return 'Installed and ready offline';
  if (snapshot.stage === 'error') return 'Install paused';
  return snapshot.type === 'whisper' ? 'Installing offline transcription' : 'Installing offline study AI';
}

export function InstallModelProgressOverlay() {
  const insets = useSafeAreaInsets();
  const [snapshot, setSnapshot] = useState<LocalModelDownloadSnapshot | null>(
    getLocalModelDownloadSnapshot(),
  );
  const [mountedSnapshot, setMountedSnapshot] = useState<LocalModelDownloadSnapshot | null>(
    getLocalModelDownloadSnapshot(),
  );
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(18)).current;
  const shimmer = useRef(new Animated.Value(0)).current;
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return subscribeToLocalModelDownload((nextSnapshot) => {
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }

      setSnapshot(nextSnapshot);
      if (nextSnapshot) {
        setMountedSnapshot(nextSnapshot);
      }
    });
  }, []);

  useEffect(() => {
    if (!snapshot && mountedSnapshot) {
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 0,
          duration: 220,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: 18,
          duration: 220,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
      ]).start(() => setMountedSnapshot(null));
      return;
    }

    if (!snapshot) return;

    Animated.parallel([
      Animated.spring(opacity, {
        toValue: 1,
        damping: 18,
        stiffness: 170,
        mass: 0.9,
        useNativeDriver: true,
      }),
      Animated.spring(translateY, {
        toValue: 0,
        damping: 18,
        stiffness: 170,
        mass: 0.9,
        useNativeDriver: true,
      }),
    ]).start();
  }, [mountedSnapshot, opacity, snapshot, translateY]);

  useEffect(() => {
    shimmer.setValue(0);
    if (!mountedSnapshot || mountedSnapshot.stage !== 'downloading') {
      return;
    }

    const loop = Animated.loop(
      Animated.timing(shimmer, {
        toValue: 1,
        duration: 1800,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [mountedSnapshot, shimmer]);

  useEffect(() => {
    if (!snapshot || (snapshot.stage !== 'complete' && snapshot.stage !== 'error')) return;
    hideTimerRef.current = setTimeout(() => {
      setSnapshot(null);
      clearLocalModelDownload();
    }, 1800);
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, [snapshot]);

  const progressWidth: DimensionValue =
    `${Math.max(6, Math.min(100, mountedSnapshot?.progress ?? 0))}%` as `${number}%`;
  const shimmerTranslate = shimmer.interpolate({
    inputRange: [0, 1],
    outputRange: [-140, 220],
  });

  const accentColor = useMemo(() => {
    if (!mountedSnapshot) return theme.colors.primary;
    if (mountedSnapshot.stage === 'complete') return theme.colors.success;
    if (mountedSnapshot.stage === 'error') return theme.colors.warning;
    return mountedSnapshot.type === 'whisper' ? '#59C3C3' : '#7C72FF';
  }, [mountedSnapshot]);

  if (!mountedSnapshot) return null;

  const downloadedText = formatBytes(mountedSnapshot.downloadedBytes);
  const totalText = formatBytes(mountedSnapshot.totalBytes);

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.container,
        {
          top: insets.top + 12,
          opacity,
          transform: [{ translateY }],
        },
      ]}
    >
      <View style={styles.card}>
        <View style={styles.row}>
          <View style={[styles.pill, { backgroundColor: `${accentColor}22`, borderColor: `${accentColor}55` }]}>
            <View style={[styles.pillDot, { backgroundColor: accentColor }]} />
            <Text style={styles.pillText}>
              {mountedSnapshot.type === 'whisper' ? 'Offline Speech' : 'Offline Study AI'}
            </Text>
          </View>
          <Text style={styles.percent}>{Math.round(mountedSnapshot.progress)}%</Text>
        </View>

        <Text style={styles.title}>{getStageLabel(mountedSnapshot)}</Text>
        <Text style={styles.subtitle} numberOfLines={1}>
          {mountedSnapshot.modelName}
        </Text>

        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: progressWidth, backgroundColor: accentColor }]}>
            {mountedSnapshot.stage === 'downloading' ? (
              <Animated.View
                style={[
                  styles.shimmer,
                  {
                    transform: [{ translateX: shimmerTranslate }],
                  },
                ]}
              />
            ) : null}
          </View>
        </View>

        {downloadedText && totalText ? (
          <Text style={styles.meta}>
            {downloadedText} of {totalText}
          </Text>
        ) : null}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 14,
    right: 14,
    zIndex: 9998,
  },
  card: {
    backgroundColor: 'rgba(18, 20, 30, 0.92)',
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: 'rgba(140, 145, 185, 0.18)',
    shadowColor: '#000',
    shadowOpacity: 0.24,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  pillDot: {
    width: 7,
    height: 7,
    borderRadius: 999,
  },
  pillText: {
    color: theme.colors.textPrimary,
    fontSize: 12,
    fontWeight: '700',
  },
  percent: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  title: {
    color: theme.colors.textPrimary,
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 4,
  },
  subtitle: {
    color: theme.colors.textSecondary,
    fontSize: 13,
    marginBottom: 12,
  },
  progressTrack: {
    height: 8,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 999,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
    overflow: 'hidden',
  },
  shimmer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 72,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  meta: {
    marginTop: 10,
    color: theme.colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
});
