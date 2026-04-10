import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import * as Updates from 'expo-updates';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '../constants/theme';
import { useAppStateTransition } from '../hooks/useAppStateTransition';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import LinearText from './primitives/LinearText';

function StatusBanner({
  title,
  message,
  tone,
  actionLabel,
  onAction,
  busy = false,
}: {
  title: string;
  message: string;
  tone: 'warning' | 'success' | 'accent';
  actionLabel?: string;
  onAction?: () => void;
  busy?: boolean;
}) {
  const palette = {
    warning: {
      borderColor: theme.colors.warning,
      backgroundColor: 'rgba(255, 152, 0, 0.16)',
      actionColor: theme.colors.warning,
    },
    success: {
      borderColor: theme.colors.success,
      backgroundColor: 'rgba(76, 175, 80, 0.16)',
      actionColor: theme.colors.success,
    },
    accent: {
      borderColor: theme.colors.primary,
      backgroundColor: 'rgba(108, 99, 255, 0.18)',
      actionColor: theme.colors.primaryLight,
    },
  }[tone];

  return (
    <View
      style={[
        styles.banner,
        {
          borderColor: palette.borderColor,
          backgroundColor: palette.backgroundColor,
        },
      ]}
    >
      <View style={styles.bannerCopy}>
        <LinearText style={styles.bannerTitle}>{title}</LinearText>
        <LinearText style={styles.bannerMessage}>{message}</LinearText>
      </View>
      {busy ? (
        <ActivityIndicator size="small" color={palette.actionColor} />
      ) : actionLabel && onAction ? (
        <Pressable style={styles.bannerAction} onPress={onAction}>
          <LinearText style={[styles.bannerActionText, { color: palette.actionColor }]}>
            {actionLabel}
          </LinearText>
        </Pressable>
      ) : null}
    </View>
  );
}

export default function AppStatusBanners() {
  const insets = useSafeAreaInsets();
  const { isOffline } = useNetworkStatus();
  const updates = Updates.useUpdates();
  const [installingUpdate, setInstallingUpdate] = useState(false);

  const checkForUpdates = useCallback(async () => {
    if (__DEV__ || !Updates.isEnabled || installingUpdate) return;
    try {
      await Updates.checkForUpdateAsync();
    } catch (error) {
      console.warn('[Updates] Failed to check for updates:', error);
    }
  }, [installingUpdate]);

  useEffect(() => {
    void checkForUpdates();
  }, [checkForUpdates]);

  useAppStateTransition({
    onForeground: () => {
      void checkForUpdates();
    },
  });

  const handleInstallUpdate = useCallback(async () => {
    if (!Updates.isEnabled || installingUpdate) return;

    setInstallingUpdate(true);
    try {
      if (!updates.isUpdatePending) {
        await Updates.fetchUpdateAsync();
      }
      await Updates.reloadAsync();
    } catch (error) {
      console.warn('[Updates] Failed to install update:', error);
    } finally {
      setInstallingUpdate(false);
    }
  }, [installingUpdate, updates.isUpdatePending]);

  const updateBanner = useMemo(() => {
    if (__DEV__ || !Updates.isEnabled) return null;

    if (updates.isDownloading) {
      const percent =
        typeof updates.downloadProgress === 'number'
          ? `${Math.round(updates.downloadProgress * 100)}%`
          : 'Preparing';
      return (
        <StatusBanner
          title="Downloading update"
          message={`Installing the latest app bundle. ${percent}`}
          tone="accent"
          busy
        />
      );
    }

    if (updates.isUpdatePending) {
      return (
        <StatusBanner
          title="Update ready"
          message="A newer app version has been downloaded. Restart to use it."
          tone="success"
          actionLabel="Restart"
          onAction={() => {
            void handleInstallUpdate();
          }}
          busy={installingUpdate}
        />
      );
    }

    if (updates.isUpdateAvailable) {
      return (
        <StatusBanner
          title="Update available"
          message="A newer app version is ready to download."
          tone="accent"
          actionLabel="Install"
          onAction={() => {
            void handleInstallUpdate();
          }}
          busy={installingUpdate}
        />
      );
    }

    return null;
  }, [
    handleInstallUpdate,
    installingUpdate,
    updates.downloadProgress,
    updates.isDownloading,
    updates.isUpdateAvailable,
    updates.isUpdatePending,
  ]);

  if (!isOffline && !updateBanner) {
    return null;
  }

  return (
    <View
      pointerEvents="box-none"
      style={[styles.container, { top: insets.top + 8 }]}
      accessibilityElementsHidden={false}
    >
      {isOffline ? (
        <StatusBanner
          title="Offline"
          message="Network-dependent features will queue and retry once you reconnect."
          tone="warning"
        />
      ) : null}
      {updateBanner}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 12,
    right: 12,
    zIndex: 60,
    gap: 8,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    shadowColor: '#000000',
    shadowOpacity: 0.16,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 12,
    elevation: 6,
  },
  bannerCopy: {
    flex: 1,
    gap: 2,
  },
  bannerTitle: {
    color: theme.colors.textPrimary,
    fontSize: 13,
    fontWeight: '800',
  },
  bannerMessage: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    lineHeight: 17,
  },
  bannerAction: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  bannerActionText: {
    fontSize: 12,
    fontWeight: '800',
  },
});
