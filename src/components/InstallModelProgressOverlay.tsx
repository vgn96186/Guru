import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Animated, Easing, PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import type { DimensionValue } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '../constants/theme';
import {
  clearLocalModelDownload,
  getLocalModelDownloadSnapshot,
  isDownloadMinimized,
  setDownloadMinimized,
  subscribeToLocalModelDownload,
  subscribeToMinimized,
  type LocalModelDownloadSnapshot,
} from '../services/localModelDownloadState';
import { isDownloadPaused, pauseDownload, resumeDownload } from '../services/localModelBootstrap';

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
  return snapshot.type === 'whisper'
    ? 'Installing offline transcription'
    : 'Installing offline study AI';
}

export function InstallModelProgressOverlay() {
  const insets = useSafeAreaInsets();
  const [snapshot, setSnapshot] = useState<LocalModelDownloadSnapshot | null>(
    getLocalModelDownloadSnapshot(),
  );
  const [mountedSnapshot, setMountedSnapshot] = useState<LocalModelDownloadSnapshot | null>(
    getLocalModelDownloadSnapshot(),
  );
  const [minimized, setMinimized] = useState(isDownloadMinimized());
  const [paused, setPaused] = useState(isDownloadPaused());
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(18)).current;
  const shimmer = useRef(new Animated.Value(0)).current;
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cardPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_event, gestureState) =>
        Math.abs(gestureState.dy) > 12 && Math.abs(gestureState.dy) > Math.abs(gestureState.dx),
      onPanResponderRelease: (_event, gestureState) => {
        if (gestureState.dy < -28) {
          setDownloadMinimized(true);
        }
      },
    }),
  ).current;

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

  useEffect(() => subscribeToMinimized(setMinimized), []);

  useEffect(() => {
    if (!snapshot) return;
    const shouldAutoMinimize =
      snapshot.stage === 'preparing' ||
      snapshot.stage === 'downloading' ||
      snapshot.stage === 'verifying';
    if (shouldAutoMinimize) {
      setDownloadMinimized(true);
    } else {
      setDownloadMinimized(false);
    }
  }, [snapshot]);

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
      ]).start(() => {
        setMountedSnapshot(null);
        setDownloadMinimized(false);
      });
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
    }, 1200);
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, [snapshot]);

  useEffect(() => {
    if (!snapshot || snapshot.stage !== 'downloading' || snapshot.progress < 99) return;
    const t = setTimeout(() => {
      clearLocalModelDownload();
    }, 20000);
    return () => clearTimeout(t);
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
  const isActive =
    mountedSnapshot.stage === 'downloading' ||
    mountedSnapshot.stage === 'preparing' ||
    (mountedSnapshot.stage === 'error' && mountedSnapshot.message === 'Download paused');

  const shouldUseCompactUi =
    minimized ||
    mountedSnapshot.stage === 'preparing' ||
    mountedSnapshot.stage === 'downloading' ||
    mountedSnapshot.stage === 'verifying';

  if (shouldUseCompactUi && isActive) {
    return (
      <Animated.View
        style={[
          styles.miniContainer,
          {
            top: insets.top + 10,
            opacity,
            transform: [{ translateY }],
          },
        ]}
      >
        <Pressable
          style={[styles.miniPill, { borderColor: `${accentColor}55` }]}
          onPress={() => setDownloadMinimized(false)}
        >
          <View style={[styles.miniDot, { backgroundColor: accentColor }]} />
          <Text style={styles.miniLabel}>
            {mountedSnapshot.type === 'whisper' ? 'Speech' : 'Study AI'}
          </Text>
          <Text style={styles.miniText}>{Math.round(mountedSnapshot.progress)}%</Text>
          <View style={styles.miniBarTrack}>
            <View
              style={[styles.miniBarFill, { width: progressWidth, backgroundColor: accentColor }]}
            />
          </View>
          <Text style={styles.miniMeta} numberOfLines={1}>
            {mountedSnapshot.stage === 'verifying'
              ? 'Verifying'
              : downloadedText && totalText
                ? `${downloadedText} / ${totalText}`
                : getStageLabel(mountedSnapshot)}
          </Text>
        </Pressable>
      </Animated.View>
    );
  }

  return (
    <Animated.View
      pointerEvents={isActive ? 'box-none' : 'none'}
      style={[
        styles.container,
        {
          top: insets.top + 12,
          opacity,
          transform: [{ translateY }],
        },
      ]}
    >
      <View style={styles.card} {...cardPanResponder.panHandlers}>
        <View style={styles.row}>
          <View
            style={[
              styles.pill,
              { backgroundColor: `${accentColor}22`, borderColor: `${accentColor}55` },
            ]}
          >
            <View style={[styles.pillDot, { backgroundColor: accentColor }]} />
            <Text style={styles.pillText}>
              {mountedSnapshot.type === 'whisper' ? 'Offline Speech' : 'Offline Study AI'}
            </Text>
          </View>
          <View style={styles.rowRight}>
            <Text style={styles.percent}>{Math.round(mountedSnapshot.progress)}%</Text>
            {isActive ? (
              <>
                <Pressable
                  style={styles.iconBtn}
                  onPress={() => {
                    if (paused) {
                      resumeDownload();
                      setPaused(false);
                    } else {
                      pauseDownload();
                      setPaused(true);
                    }
                  }}
                  hitSlop={12}
                >
                  <Ionicons
                    name={paused ? 'play' : 'pause'}
                    size={15}
                    color={theme.colors.textSecondary}
                  />
                </Pressable>
                <Pressable
                  style={styles.iconBtn}
                  onPress={() => setDownloadMinimized(true)}
                  hitSlop={12}
                >
                  <Ionicons
                    name="chevron-up"
                    size={16}
                    color={theme.colors.textSecondary}
                  />
                </Pressable>
              </>
            ) : null}
          </View>
        </View>

        <Text style={styles.title}>{getStageLabel(mountedSnapshot)}</Text>
        <Text style={styles.subtitle} numberOfLines={1}>
          {mountedSnapshot.modelName}
        </Text>

        <View style={styles.progressTrack}>
          <View
            style={[styles.progressFill, { width: progressWidth, backgroundColor: accentColor }]}
          >
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
        {isActive ? <Text style={styles.gestureHint}>Swipe up to minimize</Text> : null}
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
  rowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
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
  iconBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
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
  gestureHint: {
    marginTop: 8,
    color: theme.colors.textMuted,
    fontSize: 10,
    textAlign: 'right',
    letterSpacing: 0.3,
  },
  miniContainer: {
    position: 'absolute',
    right: 14,
    zIndex: 9998,
  },
  miniPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(18, 20, 30, 0.92)',
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 7,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  miniDot: {
    width: 7,
    height: 7,
    borderRadius: 999,
  },
  miniText: {
    color: theme.colors.textPrimary,
    fontSize: 12,
    fontWeight: '700',
  },
  miniLabel: {
    color: theme.colors.textSecondary,
    fontSize: 11,
    fontWeight: '700',
  },
  miniBarTrack: {
    width: 52,
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 999,
    overflow: 'hidden',
  },
  miniBarFill: {
    height: '100%',
    borderRadius: 999,
  },
  miniMeta: {
    color: theme.colors.textMuted,
    fontSize: 10,
    maxWidth: 92,
  },
});
