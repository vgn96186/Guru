let capturedTaskCallback: Function;

jest.mock('expo-task-manager', () => ({
  defineTask: jest.fn((name, cb) => {
    if (name === 'PREFETCH_AI_CONTENT') {
      capturedTaskCallback = cb;
    }
  }),
  isTaskRegisteredAsync: jest.fn(),
}));

jest.mock('expo-background-fetch', () => ({
  registerTaskAsync: jest.fn(),
  BackgroundFetchResult: {
    NewData: 1,
    NoData: 2,
    Failed: 3,
  },
}));

jest.mock('../db/queries/topics', () => ({
  getAllTopicsWithProgress: jest.fn(),
}));

jest.mock('./aiService', () => ({
  prefetchTopicContent: jest.fn(),
}));

jest.mock('../db/repositories', () => ({
  profileRepository: {
    getProfile: jest.fn(),
  },
}));

jest.mock('./notificationService', () => ({
  refreshAccountabilityNotifications: jest.fn(),
}));

import * as BackgroundFetch from 'expo-background-fetch';
import * as TaskManager from 'expo-task-manager';
import { getAllTopicsWithProgress } from '../db/queries/topics';
import { prefetchTopicContent } from './aiService';
import { profileRepository } from '../db/repositories';
import { refreshAccountabilityNotifications } from './notificationService';
import { registerBackgroundFetch } from './backgroundTasks';

describe('backgroundTasks', () => {
  const PREFETCH_TASK = 'PREFETCH_AI_CONTENT';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('registerBackgroundFetch', () => {
    it('should register task if not already registered', async () => {
      (TaskManager.isTaskRegisteredAsync as jest.Mock).mockResolvedValue(false);
      await registerBackgroundFetch();
      expect(BackgroundFetch.registerTaskAsync).toHaveBeenCalledWith(PREFETCH_TASK, expect.any(Object));
    });

    it('should not register task if already registered', async () => {
      (TaskManager.isTaskRegisteredAsync as jest.Mock).mockResolvedValue(true);
      await registerBackgroundFetch();
      expect(BackgroundFetch.registerTaskAsync).not.toHaveBeenCalled();
    });

    it('should handle registration error gracefully', async () => {
      (TaskManager.isTaskRegisteredAsync as jest.Mock).mockRejectedValue(new Error('Failed'));
      await registerBackgroundFetch();
      // Should not throw
    });
  });

  describe('task definition', () => {
    it('should have defined the task', () => {
      expect(capturedTaskCallback).toBeDefined();
    });

    it('should prefetch content for due or unseen topics', async () => {
      (profileRepository.getProfile as jest.Mock).mockResolvedValue({
        blockedContentTypes: [],
      });

      const now = Date.now();
      const mockTopics = [
        { name: 'Topic 1', inicetPriority: 10, progress: { status: 'unseen' } },
        { name: 'Topic 2', inicetPriority: 20, progress: { status: 'seen', fsrsDue: new Date(now - 1000).toISOString() } },
        { name: 'Topic 3', inicetPriority: 5, progress: { status: 'seen', fsrsDue: new Date(now + 100000).toISOString() } },
      ];

      (getAllTopicsWithProgress as jest.Mock).mockResolvedValue(mockTopics);
      (prefetchTopicContent as jest.Mock).mockResolvedValue(undefined);
      (refreshAccountabilityNotifications as jest.Mock).mockResolvedValue(undefined);

      const result = await capturedTaskCallback();

      expect(result).toBe(BackgroundFetch.BackgroundFetchResult.NewData);
      expect(prefetchTopicContent).toHaveBeenCalledTimes(2); // Topic 1 and Topic 2
      expect(prefetchTopicContent).toHaveBeenCalledWith(mockTopics[1], expect.any(Array)); // Topic 2 has higher priority
      expect(prefetchTopicContent).toHaveBeenCalledWith(mockTopics[0], expect.any(Array));
    });

    it('should return NoData if no candidates found', async () => {
      (profileRepository.getProfile as jest.Mock).mockResolvedValue({
        blockedContentTypes: [],
      });

      (getAllTopicsWithProgress as jest.Mock).mockResolvedValue([]);

      const result = await capturedTaskCallback();

      expect(result).toBe(BackgroundFetch.BackgroundFetchResult.NoData);
    });

    it('should return Failed if an error occurs', async () => {
      (profileRepository.getProfile as jest.Mock).mockRejectedValue(new Error('Database error'));

      const result = await capturedTaskCallback();

      expect(result).toBe(BackgroundFetch.BackgroundFetchResult.Failed);
    });

    it('should filter blocked content types', async () => {
      (profileRepository.getProfile as jest.Mock).mockResolvedValue({
        blockedContentTypes: ['keypoints'],
      });

      (getAllTopicsWithProgress as jest.Mock).mockResolvedValue([
        { name: 'Topic 1', inicetPriority: 10, progress: { status: 'unseen' } },
      ]);

      await capturedTaskCallback();

      const typesToFetch = (prefetchTopicContent as jest.Mock).mock.calls[0][1];
      expect(typesToFetch).not.toContain('keypoints');
    });
  });
});
