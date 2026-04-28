import { useState, useCallback } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { getRecordingPermissionsAsync, requestRecordingPermissionsAsync } from 'expo-audio';
import {
  canDrawOverlays,
  hasAllFilesAccess,
  requestAllFilesAccess,
  requestOverlayPermission,
} from '../../../../modules/app-launcher';
import { showInfo } from '../../../components/dialogService';

export interface PermissionStatus {
  notifs: string;
  overlay: string;
  mic: string;
  localFiles: string;
}

export function useSettingsPermissions() {
  const [permStatus, setPermStatus] = useState<PermissionStatus>({
    notifs: 'undetermined',
    overlay: 'undetermined',
    mic: 'undetermined',
    localFiles: 'undetermined',
  });

  const checkPermissions = useCallback(async () => {
    const n = await Notifications.getPermissionsAsync();
    const m = await getRecordingPermissionsAsync();
    let o = 'undetermined';
    let localFiles = 'undetermined';
    if (Platform.OS === 'android') {
      const hasOverlay = await canDrawOverlays();
      o = hasOverlay ? 'granted' : 'denied';
      const hasLocalFileAccess = await hasAllFilesAccess();
      localFiles = hasLocalFileAccess ? 'granted' : 'denied';
    }

    setPermStatus({
      notifs: n.status,
      mic: m.status,
      overlay: o,
      localFiles,
    });
  }, []);

  const onRequestNotifications = useCallback(async () => {
    await Notifications.requestPermissionsAsync();
    checkPermissions();
  }, [checkPermissions]);

  const onRequestMic = useCallback(async () => {
    await requestRecordingPermissionsAsync();
    checkPermissions();
  }, [checkPermissions]);

  const onRequestLocalFiles = useCallback(async () => {
    const openedSettings = await requestAllFilesAccess();
    if (openedSettings) {
      showInfo(
        'File Access Permission',
        'Please enable file access for Guru in the settings screen that just opened, then return to the app.',
      );
      return;
    }
    await checkPermissions();
  }, [checkPermissions]);

  const onRequestOverlay = useCallback(async () => {
    await requestOverlayPermission();
    showInfo(
      'Overlay Permission',
      'Please enable Guru in the settings screen that just opened, then return to the app.',
    );
  }, []);

  const requestPomodoroOverlay = useCallback(async () => {
    await requestOverlayPermission();
    await checkPermissions();
  }, [checkPermissions]);

  return {
    permStatus,
    checkPermissions,
    onRequestNotifications,
    onRequestMic,
    onRequestLocalFiles,
    onRequestOverlay,
    requestPomodoroOverlay,
  };
}
