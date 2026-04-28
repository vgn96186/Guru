/**
 * Central place to request app permissions (notifications, mic, storage).
 * Call after check-in so the app asks for everything it needs up front.
 * Only requests each permission if not already granted.
 */
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { getRecordingPermissionsAsync, requestRecordingPermissionsAsync } from 'expo-audio';
import {
  requestNotificationPermissions,
  refreshAccountabilityNotificationsSafely,
} from './notificationService';
import { requestRecordingPermissions } from './appLauncher/permissions';

export interface AppPermissionsResult {
  notifications: boolean;
  audio: boolean;
  recordingAndStorage: boolean;
}

function refreshAccountabilityNotificationsSilently(): void {
  void refreshAccountabilityNotificationsSafely();
}

/**
 * Request notification permission only if not already granted.
 * Refreshes accountability notifications when permission is or becomes granted.
 */
export async function requestNotifications(): Promise<boolean> {
  try {
    const { status } = await Notifications.getPermissionsAsync();
    if (status === 'granted') {
      refreshAccountabilityNotificationsSilently();
      return true;
    }
  } catch {
    // fall through to request
  }
  const granted = await requestNotificationPermissions();
  if (granted) {
    refreshAccountabilityNotificationsSilently();
  }
  return granted;
}

/**
 * Request microphone permission for in-app recording only if not already granted.
 */
export async function requestAudio(): Promise<boolean> {
  try {
    const { status } = await getRecordingPermissionsAsync();
    if (status === 'granted') return true;
    const { status: newStatus, granted } = await requestRecordingPermissionsAsync();
    return granted || newStatus === 'granted';
  } catch (e) {
    if (__DEV__) console.warn('[AppPermissions] Audio request failed:', e);
    return false;
  }
}

/**
 * On Android: request RECORD_AUDIO + READ/WRITE_EXTERNAL_STORAGE only if not already granted.
 * No-op on iOS.
 */
export async function requestRecordingAndStorage(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  return requestRecordingPermissions();
}

/**
 * Request all optional permissions the app needs. Run once after check-in
 * so the user sees notification, mic, and (on Android) storage prompts
 * before using features that need them.
 */
export async function requestAllPermissions(): Promise<AppPermissionsResult> {
  const notifications = await requestNotifications();
  const audio = await requestAudio();
  const recordingAndStorage = await requestRecordingAndStorage();
  return { notifications, audio, recordingAndStorage };
}
