import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import {
  getRecordingPermissionsAsync,
  requestRecordingPermissionsAsync,
} from 'expo-audio';
import * as NotificationService from './notificationService';
import * as AppLauncherPermissions from './appLauncher/permissions';
import {
  requestNotifications,
  requestAudio,
  requestRecordingAndStorage,
  requestAllPermissions,
} from './appPermissions';

jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn(),
}));

jest.mock('expo-audio', () => ({
  getRecordingPermissionsAsync: jest.fn(),
  requestRecordingPermissionsAsync: jest.fn(),
}));

jest.mock('./notificationService', () => ({
  requestNotificationPermissions: jest.fn(),
  refreshAccountabilityNotifications: jest.fn(() => Promise.resolve()),
  refreshAccountabilityNotificationsSafely: jest.fn(() => Promise.resolve()),
}));

jest.mock('./appLauncher/permissions', () => ({
  requestRecordingPermissions: jest.fn(),
}));

describe('appPermissions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Platform.OS = 'ios';
    // Ensure mocks return promises
    (NotificationService.refreshAccountabilityNotificationsSafely as jest.Mock).mockResolvedValue(
      undefined,
    );
    (NotificationService.requestNotificationPermissions as jest.Mock).mockResolvedValue(false);
    (AppLauncherPermissions.requestRecordingPermissions as jest.Mock).mockResolvedValue(false);
  });

  describe('requestNotifications', () => {
    it('returns true and refreshes if permission is already granted', async () => {
      (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted' });

      const result = await requestNotifications();

      expect(result).toBe(true);
      expect(NotificationService.refreshAccountabilityNotificationsSafely).toHaveBeenCalled();
      expect(NotificationService.requestNotificationPermissions).not.toHaveBeenCalled();
    });

    it('requests permissions if not already granted', async () => {
      (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({
        status: 'undetermined',
      });
      (NotificationService.requestNotificationPermissions as jest.Mock).mockResolvedValue(true);

      const result = await requestNotifications();

      expect(result).toBe(true);
      expect(NotificationService.requestNotificationPermissions).toHaveBeenCalled();
      expect(NotificationService.refreshAccountabilityNotificationsSafely).toHaveBeenCalled();
    });

    it('returns false if request fails', async () => {
      (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({
        status: 'undetermined',
      });
      (NotificationService.requestNotificationPermissions as jest.Mock).mockResolvedValue(false);

      const result = await requestNotifications();

      expect(result).toBe(false);
      expect(NotificationService.refreshAccountabilityNotificationsSafely).not.toHaveBeenCalled();
    });

    it('falls through to request if getPermissionsAsync throws', async () => {
      (Notifications.getPermissionsAsync as jest.Mock).mockRejectedValue(new Error('fail'));
      (NotificationService.requestNotificationPermissions as jest.Mock).mockResolvedValue(true);

      const result = await requestNotifications();

      expect(result).toBe(true);
      expect(NotificationService.requestNotificationPermissions).toHaveBeenCalled();
    });
  });

  describe('requestAudio', () => {
    it('returns true if permission is already granted', async () => {
      (getRecordingPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted' });

      const result = await requestAudio();

      expect(result).toBe(true);
      expect(requestRecordingPermissionsAsync).not.toHaveBeenCalled();
    });

    it('requests permissions if not already granted and returns true if successful', async () => {
      (getRecordingPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'undetermined' });
      (requestRecordingPermissionsAsync as jest.Mock).mockResolvedValue({
        status: 'granted',
        granted: true,
      });

      const result = await requestAudio();

      expect(result).toBe(true);
      expect(requestRecordingPermissionsAsync).toHaveBeenCalled();
    });

    it('returns false if permission request is denied', async () => {
      (getRecordingPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'undetermined' });
      (requestRecordingPermissionsAsync as jest.Mock).mockResolvedValue({
        status: 'denied',
        granted: false,
      });

      const result = await requestAudio();

      expect(result).toBe(false);
    });

    it('returns false if getPermissionsAsync throws', async () => {
      (getRecordingPermissionsAsync as jest.Mock).mockRejectedValue(new Error('fail'));
      const result = await requestAudio();
      expect(result).toBe(false);
    });
  });

  describe('requestRecordingAndStorage', () => {
    it('returns true immediately on iOS', async () => {
      Platform.OS = 'ios';
      const result = await requestRecordingAndStorage();
      expect(result).toBe(true);
      expect(AppLauncherPermissions.requestRecordingPermissions).not.toHaveBeenCalled();
    });

    it('calls requestRecordingPermissions on Android', async () => {
      Platform.OS = 'android';
      (AppLauncherPermissions.requestRecordingPermissions as jest.Mock).mockResolvedValue(true);

      const result = await requestRecordingAndStorage();

      expect(result).toBe(true);
      expect(AppLauncherPermissions.requestRecordingPermissions).toHaveBeenCalled();
    });
  });

  describe('requestAllPermissions', () => {
    it('calls all individual request functions and returns aggregated result', async () => {
      (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted' });
      (getRecordingPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted' });
      Platform.OS = 'ios';

      const result = await requestAllPermissions();

      expect(result).toEqual({
        notifications: true,
        audio: true,
        recordingAndStorage: true,
      });
    });

    it('handles partial failures', async () => {
      (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'denied' });
      (NotificationService.requestNotificationPermissions as jest.Mock).mockResolvedValue(false);
      (getRecordingPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted' });
      Platform.OS = 'android';
      (AppLauncherPermissions.requestRecordingPermissions as jest.Mock).mockResolvedValue(true);

      const result = await requestAllPermissions();

      expect(result).toEqual({
        notifications: false,
        audio: true,
        recordingAndStorage: true,
      });
    });
  });
});
