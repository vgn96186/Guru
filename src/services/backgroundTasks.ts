import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';
import { getAllTopicsWithProgress } from '../db/queries/topics';
import { profileRepository } from '../db/repositories';
import { refreshAccountabilityNotificationsSafely } from './notificationService';
import { getMoodContentTypes } from '../constants/prompts';
import type { ContentType, TopicWithProgress } from '../types';

const PREFETCH_TASK = 'PREFETCH_AI_CONTENT';
const DEFAULT_PREFETCH_TOPIC_LIMIT = 3;

function selectPrefetchCandidates(topics: TopicWithProgress[], limit: number): TopicWithProgress[] {
  return topics
    .filter(
      (t: TopicWithProgress) =>
        t.progress.status === 'unseen' ||
        (t.progress.fsrsDue && new Date(t.progress.fsrsDue).getTime() <= Date.now()),
    )
    .sort((a: TopicWithProgress, b: TopicWithProgress) => b.inicetPriority - a.inicetPriority)
    .slice(0, limit);
}

function resolvePrefetchContentTypes(blockedContentTypes: ContentType[]): ContentType[] {
  const contentTypes = getMoodContentTypes('good').filter(
    (ct: ContentType) => !blockedContentTypes.includes(ct),
  );
  return contentTypes.length > 0 ? contentTypes : ['keypoints'];
}

export async function warmAiContentCache(options?: {
  topicLimit?: number;
  refreshNotifications?: boolean;
}): Promise<number> {
  const { prefetchTopicContent } = await import('./aiService');
  const profile = await profileRepository.getProfile();
  const allTopics = await getAllTopicsWithProgress();
  const candidates = selectPrefetchCandidates(
    allTopics,
    options?.topicLimit ?? DEFAULT_PREFETCH_TOPIC_LIMIT,
  );

  if (candidates.length === 0) {
    return 0;
  }

  const typesToFetch = resolvePrefetchContentTypes(profile.blockedContentTypes ?? []);
  await Promise.allSettled(
    candidates.map((topic) => prefetchTopicContent(topic, typesToFetch, 'groq')),
  );

  if (options?.refreshNotifications ?? false) {
    await refreshAccountabilityNotificationsSafely((e) =>
      console.warn('[BG] Notification refresh failed:', e),
    );
  }

  return candidates.length;
}

try {
  TaskManager.defineTask(PREFETCH_TASK, async () => {
    try {
      const prefetchedCount = await warmAiContentCache({
        topicLimit: DEFAULT_PREFETCH_TOPIC_LIMIT,
        refreshNotifications: true,
      });

      if (prefetchedCount === 0) {
        return BackgroundTask.BackgroundTaskResult.Success;
      }

      return BackgroundTask.BackgroundTaskResult.Success;
    } catch (error) {
      if (__DEV__) console.error('Background task failed:', error);
      return BackgroundTask.BackgroundTaskResult.Failed;
    }
  });
} catch (e) {
  if (__DEV__) console.warn('Failed to define background task:', e);
}

/** Registers deferred AI prefetch (expo-background-task; replaces deprecated expo-background-fetch). */
export async function registerBackgroundFetch() {
  if (Platform.OS === 'web') return;
  try {
    // Defer one tick so the RN / Expo native module bridge is ready (avoids rare
    // "runtime not ready" / task lookup failures on cold boot).
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    const isRegistered = await TaskManager.isTaskRegisteredAsync(PREFETCH_TASK);
    if (!isRegistered) {
      await BackgroundTask.registerTaskAsync(PREFETCH_TASK, {
        minimumInterval: 12 * 60,
      });
    }
  } catch (e) {
    if (__DEV__) console.warn('Failed to register background task:', e);
  }
}
