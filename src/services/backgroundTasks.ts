import * as BackgroundFetch from 'expo-background-fetch';
import * as TaskManager from 'expo-task-manager';
import { getAllTopicsWithProgress } from '../db/queries/topics';
import { prefetchTopicContent } from './aiService';
import { profileRepository } from '../db/repositories';
import { refreshAccountabilityNotificationsSafely } from './notificationService';
import { getMoodContentTypes } from '../constants/prompts';
import type { ContentType, TopicWithProgress } from '../types';

const PREFETCH_TASK = 'PREFETCH_AI_CONTENT';

try {
  TaskManager.defineTask(PREFETCH_TASK, async () => {
    try {
      const profile = await profileRepository.getProfile();

      const allTopics = await getAllTopicsWithProgress();
      const candidates = allTopics
        .filter(
          (t: TopicWithProgress) =>
            t.progress.status === 'unseen' ||
            (t.progress.fsrsDue && new Date(t.progress.fsrsDue).getTime() <= Date.now()),
        )
        .sort((a: TopicWithProgress, b: TopicWithProgress) => b.inicetPriority - a.inicetPriority)
        .slice(0, 3);

      if (candidates.length === 0) {
        return BackgroundFetch.BackgroundFetchResult.NoData;
      }

      const contentTypes = getMoodContentTypes('good').filter(
        (ct: ContentType) => !profile.blockedContentTypes.includes(ct),
      );
      const typesToFetch: ContentType[] = contentTypes.length > 0 ? contentTypes : ['keypoints'];

      await Promise.allSettled(
        candidates.map((topic) => prefetchTopicContent(topic, typesToFetch)),
      );

      await refreshAccountabilityNotificationsSafely((e) =>
        console.warn('[BG] Notification refresh failed:', e),
      );

      return BackgroundFetch.BackgroundFetchResult.NewData;
    } catch (error) {
      if (__DEV__) console.error('Background fetch failed:', error);
      return BackgroundFetch.BackgroundFetchResult.Failed;
    }
  });
} catch (e) {
  if (__DEV__) console.warn('Failed to define background task:', e);
}

export async function registerBackgroundFetch() {
  try {
    const isRegistered = await TaskManager.isTaskRegisteredAsync(PREFETCH_TASK);
    if (!isRegistered) {
      await BackgroundFetch.registerTaskAsync(PREFETCH_TASK, {
        minimumInterval: 60 * 60 * 12, // 12 hours
        stopOnTerminate: false,
        startOnBoot: true,
      });
    }
  } catch (e) {
    if (__DEV__) console.warn('Failed to register background fetch:', e);
  }
}
