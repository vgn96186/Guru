import * as BackgroundFetch from 'expo-background-fetch';
import * as TaskManager from 'expo-task-manager';

const PREFETCH_TASK = 'PREFETCH_AI_CONTENT';

try {
  TaskManager.defineTask(PREFETCH_TASK, async () => {
    try {
      const { getAllTopicsWithProgress } = require('../db/queries/topics');
      const { prefetchTopicContent } = require('./aiService');
      const { getUserProfile } = require('../db/queries/progress');
      const { getMoodContentTypes } = require('../constants/prompts');

      const profile = getUserProfile();
      if (!profile.openrouterApiKey) {
        return BackgroundFetch.BackgroundFetchResult.NoData;
      }

      const allTopics = getAllTopicsWithProgress();
      const candidates = allTopics
        .filter((t: any) => t.progress.status === 'unseen' || (t.progress.fsrsDue && new Date(t.progress.fsrsDue).getTime() <= Date.now()))
        .sort((a: any, b: any) => b.inicetPriority - a.inicetPriority)
        .slice(0, 3);

      if (candidates.length === 0) {
        return BackgroundFetch.BackgroundFetchResult.NoData;
      }

      const contentTypes = getMoodContentTypes('good').filter((ct: any) => !profile.blockedContentTypes.includes(ct));
      const typesToFetch = contentTypes.length > 0 ? contentTypes : ['keypoints'];

      for (const topic of candidates) {
        await prefetchTopicContent(topic, typesToFetch, profile.openrouterApiKey, profile.openrouterKey);
      }

      return BackgroundFetch.BackgroundFetchResult.NewData;
    } catch (error) {
      console.error('Background fetch failed:', error);
      return BackgroundFetch.BackgroundFetchResult.Failed;
    }
  });
} catch (e) {
  console.warn('Failed to define background task:', e);
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
    console.warn('Failed to register background fetch:', e);
  }
}
