import * as Notifications from 'expo-notifications';
import {
  requestNotificationPermissions,
  scheduleStreakWarning,
  sendImmediateNag,
  scheduleHarassment,
  refreshAccountabilityNotifications,
  cancelAllNotifications,
} from './notificationService';
import { generateAccountabilityMessages, generateBreakEndMessages } from './ai';
import { profileRepository, dailyLogRepository } from '../db/repositories';
import {
  getWeakestTopics,
  getTopicsDueForReview,
  getNemesisTopics,
  getSubjectBreakdown,
} from '../db/queries/topics';

jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  getPermissionsAsync: jest.fn().mockResolvedValue({ granted: true }),
  scheduleNotificationAsync: jest.fn(),
  cancelScheduledNotificationAsync: jest.fn(),
  cancelAllScheduledNotificationsAsync: jest.fn(),
  getAllScheduledNotificationsAsync: jest.fn().mockResolvedValue([]),
  setBadgeCountAsync: jest.fn(),
  SchedulableTriggerInputTypes: {
    DAILY: 'daily',
    DATE: 'date',
  },
  AndroidNotificationPriority: {
    MAX: 'max',
  },
}));

jest.mock('./ai', () => ({
  generateAccountabilityMessages: jest.fn(),
  generateBreakEndMessages: jest.fn(),
}));

jest.mock('../db/repositories', () => ({
  profileRepository: {
    getProfile: jest.fn(),
    getDaysToExam: jest.fn(),
  },
  dailyLogRepository: {
    getLast30DaysLog: jest.fn(),
  },
}));

jest.mock('../db/queries/topics', () => ({
  getWeakestTopics: jest.fn(),
  getTopicsDueForReview: jest.fn(),
  getNemesisTopics: jest.fn(),
  getSubjectBreakdown: jest.fn(),
}));

jest.mock('../db/database', () => ({
  todayStr: jest.fn(() => '2023-10-27'),
}));

describe('notificationService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('requestNotificationPermissions', () => {
    it('should return true when granted', async () => {
      (Notifications.requestPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted' });
      const result = await requestNotificationPermissions();
      expect(result).toBe(true);
    });

    it('should return false when denied', async () => {
      (Notifications.requestPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'denied' });
      const result = await requestNotificationPermissions();
      expect(result).toBe(false);
    });

    it('should return false on error', async () => {
      (Notifications.requestPermissionsAsync as jest.Mock).mockRejectedValue(new Error('error'));
      const result = await requestNotificationPermissions();
      expect(result).toBe(false);
    });
  });

  describe('scheduleStreakWarning', () => {
    it('should schedule a daily notification at 9pm', async () => {
      await scheduleStreakWarning();
      expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.objectContaining({ title: '🔥 Streak Alert!' }),
          trigger: expect.objectContaining({ hour: 21, minute: 0 }),
        }),
      );
    });
  });

  describe('sendImmediateNag', () => {
    it('should schedule a notification with null trigger', async () => {
      await sendImmediateNag('Title', 'Body');
      expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.objectContaining({ title: 'Title', body: 'Body' }),
          trigger: null,
        }),
      );
    });
  });

  describe('scheduleHarassment', () => {
    it('should cancel existing and schedule 10 notifications', async () => {
      (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockResolvedValue([
        { identifier: 'harassment_0' },
      ]);
      await scheduleHarassment('shame');
      expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith('harassment_0');
      expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(10);
    });
  });

  describe('refreshAccountabilityNotifications', () => {
    const mockProfile = {
      notificationsEnabled: true,
      notificationHour: 7,
      guruFrequency: 'normal',
      displayName: 'Test User',
      streakCurrent: 5,
      inicetDate: '2024-05-01',
      neetDate: '2024-03-01',
    };

    beforeEach(() => {
      (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({ granted: true });
      (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockResolvedValue([]);
      (Notifications.scheduleNotificationAsync as jest.Mock).mockResolvedValue('mock-id');
      (Notifications.cancelAllScheduledNotificationsAsync as jest.Mock).mockResolvedValue(
        undefined,
      );
      (Notifications.setBadgeCountAsync as jest.Mock).mockResolvedValue(undefined);
      (profileRepository.getProfile as jest.Mock).mockResolvedValue(mockProfile);
      (profileRepository.getDaysToExam as jest.Mock).mockReturnValue(90);
      (getSubjectBreakdown as jest.Mock).mockResolvedValue([]);
      (getNemesisTopics as jest.Mock).mockResolvedValue([]);
      (getWeakestTopics as jest.Mock).mockResolvedValue([]);
      (getTopicsDueForReview as jest.Mock).mockResolvedValue([]);
      (dailyLogRepository.getLast30DaysLog as jest.Mock).mockResolvedValue([]);
    });

    it('should skip if notifications are disabled', async () => {
      (profileRepository.getProfile as jest.Mock).mockResolvedValue({
        ...mockProfile,
        notificationsEnabled: false,
      });
      await refreshAccountabilityNotifications();
      expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
    });

    it('should use AI generated messages', async () => {
      const aiMessages = [{ title: 'AI Title', body: 'AI Body', scheduledFor: 'morning' }];
      (generateAccountabilityMessages as jest.Mock).mockResolvedValue(aiMessages);

      await refreshAccountabilityNotifications();

      expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.objectContaining({ title: 'AI Title' }),
          trigger: expect.objectContaining({ hour: 7, minute: 30 }),
        }),
      );
    });

    it('should use fallbacks if AI fails', async () => {
      (generateAccountabilityMessages as jest.Mock).mockRejectedValue(new Error('AI failed'));

      await refreshAccountabilityNotifications();

      // Should schedule fallback notifications (morning, evening, streak)
      expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(3);
      expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          identifier: 'accountability_morning',
        }),
      );
    });

    it('should handle guruFrequency: off', async () => {
      (profileRepository.getProfile as jest.Mock).mockResolvedValue({
        ...mockProfile,
        guruFrequency: 'off',
      });
      await refreshAccountabilityNotifications();

      expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
      expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          identifier: 'accountability_streak',
          trigger: expect.objectContaining({ hour: 21 }),
        }),
      );
    });
  });

  describe('cancelAllNotifications', () => {
    it('should call cancelAllScheduledNotificationsAsync', async () => {
      await cancelAllNotifications();
      expect(Notifications.cancelAllScheduledNotificationsAsync).toHaveBeenCalled();
    });
  });
});
