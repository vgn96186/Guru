import * as BackgroundFetch from 'expo-background-fetch';
import * as TaskManager from 'expo-task-manager';
import { getAllTopicsWithProgress } from '../db/queries/topics';
import { prefetchTopicContent } from './aiService';
import { getUserProfile } from '../db/queries/progress';
import { getMoodContentTypes } from '../constants/prompts';

const PREFETCH_TASK = 'PREFETCH_AI_CONTENT';

TaskManager.defineTask(PREFETCH_TASK, async () => {
  try {
    const profile = getUserProfile();
    if (!profile.openrouterApiKey) {
      return BackgroundFetch.BackgroundFetchResult.NoData;
    }

    // Get topics that are due or unseen
    const allTopics = getAllTopicsWithProgress();
    const candidates = allTopics
      .filter(t => t.progress.status === 'unseen' || (t.progress.fsrsDue && new Date(t.progress.fsrsDue).getTime() <= Date.now()))
      .sort((a, b) => b.inicetPriority - a.inicetPriority)
      .slice(0, 3); // Pre-fetch top 3

    if (candidates.length === 0) {
      return BackgroundFetch.BackgroundFetchResult.NoData;
    }

    const contentTypes = getMoodContentTypes('good').filter(ct => !profile.blockedContentTypes.includes(ct));
    const typesToFetch = contentTypes.length > 0 ? contentTypes : ['keypoints' as const];

    for (const topic of candidates) {
      await prefetchTopicContent(topic, typesToFetch, profile.openrouterApiKey, profile.openrouterKey);
    }

    return BackgroundFetch.BackgroundFetchResult.NewData;
  } catch (error) {
    console.error('Background fetch failed:', error);
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

export async function registerBackgroundFetch() {
  const isRegistered = await TaskManager.isTaskRegisteredAsync(PREFETCH_TASK);
  if (!isRegistered) {
    await BackgroundFetch.registerTaskAsync(PREFETCH_TASK, {
      minimumInterval: 60 * 60 * 12, // 12 hours
      stopOnTerminate: false,
      startOnBoot: true,
    });
  }
}
