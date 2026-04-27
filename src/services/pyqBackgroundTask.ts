import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';
import { generateObject } from './ai/v2/generateObject';
import { z } from 'zod';
import { profileRepository } from '../db/repositories/profileRepository';
import { questionBankRepositoryDrizzle } from '../db/repositories/questionBankRepository.drizzle';
import { getAllTopicsWithProgress } from '../db/queries/topics';
import { searchWeb } from './webSearch';
import { createGuruFallbackModel } from './ai/v2/providers/guruFallback';
import type { SaveQuestionInput, TopicWithProgress } from '../types';

const PREFETCH_PYQ_TASK = 'PREFETCH_PYQ_TASK';
const PYQ_TOPIC_LIMIT = 2; // Limit to 2 topics per background tick to avoid rate limits

// Prioritize topics the user has seen/reviewed, but hasn't mastered yet
function selectPyqCandidates(topics: TopicWithProgress[], limit: number): TopicWithProgress[] {
  return topics
    .filter((t) => t.progress.status === 'seen' || t.progress.status === 'reviewed')
    .sort((a, b) => b.inicetPriority - a.inicetPriority)
    .slice(0, limit);
}

export async function prefetchPyqs(options?: { topicLimit?: number }): Promise<number> {
  const profile = await profileRepository.getProfile().catch(() => null);
  if (!profile) return 0;

  const allTopics = await getAllTopicsWithProgress();
  const candidates = selectPyqCandidates(allTopics, options?.topicLimit ?? PYQ_TOPIC_LIMIT);

  if (candidates.length === 0) return 0;

  const model = await createGuruFallbackModel({ profile });
  let savedCount = 0;

  for (const topic of candidates) {
    try {
      // 1. Ground the AI with actual web search results for the PYQs
      const query = `NEET-PG INICET ${topic.name} previous year questions pyq`;
      const pyqResults = await searchWeb({ query, maxResults: 5, profile });

      // 2. Generate structured clinical vignette questions using Vercel AI SDK
      const result = await generateObject({
        model,
        schema: z.object({
          questions: z
            .array(
              z.object({
                question: z
                  .string()
                  .describe('Single best-answer clinical vignette stem based on PYQ'),
                options: z.tuple([z.string(), z.string(), z.string(), z.string()]),
                correctIndex: z.number().min(0).max(3),
                explanation: z
                  .string()
                  .describe('Why the correct option is right and others are wrong'),
              }),
            )
            .min(3)
            .max(5),
        }),
        messages: [
          {
            role: 'system',
            content: `Generate 3-5 high-difficulty NEET-PG/INICET Previous Year Questions (PYQs) for the topic "${topic.name}" in ${topic.subjectName}.
Use the following real web search results to ground the questions in actual past exam patterns:
${JSON.stringify(pyqResults)}

CRITICAL INSTRUCTIONS:
- The questions MUST be clinical vignettes based on previous year trends.
- Do NOT generate simple one-liner recall questions. 
- Include detailed explanations.`,
          },
        ],
      });

      // 3. Map the AI output to the Question Bank schema
      const inputs: SaveQuestionInput[] = result.object.questions.map((q) => ({
        question: q.question,
        options: q.options,
        correctIndex: q.correctIndex,
        explanation: q.explanation,
        topicId: topic.id,
        topicName: topic.name,
        subjectName: topic.subjectName,
        source: 'pyq', // Matches the exact string literal in QuestionBankSource
      }));

      // 4. Persist to DB
      const saved = await questionBankRepositoryDrizzle.saveBulkQuestions(inputs);
      savedCount += saved;
    } catch (error) {
      if (__DEV__) console.warn(`[BG] Failed to fetch PYQs for ${topic.name}:`, error);
    }
  }

  return savedCount;
}

// 5. Define the global background task handler
try {
  TaskManager.defineTask(PREFETCH_PYQ_TASK, async () => {
    try {
      const savedCount = await prefetchPyqs();
      return savedCount === 0
        ? BackgroundTask.BackgroundTaskResult.Success
        : BackgroundTask.BackgroundTaskResult.Success;
    } catch (error) {
      if (__DEV__) console.error('PYQ Background task failed:', error);
      return BackgroundTask.BackgroundTaskResult.Failed;
    }
  });
} catch (e) {
  if (__DEV__) console.warn('Failed to define PYQ background task:', e);
}

// 6. Registration trigger
export async function registerPyqBackgroundFetch() {
  if (Platform.OS === 'web') return;
  try {
    await new Promise((resolve) => setTimeout(resolve, 0)); // Defer one tick for RN bridge
    const isRegistered = await TaskManager.isTaskRegisteredAsync(PREFETCH_PYQ_TASK);
    if (!isRegistered) {
      await BackgroundTask.registerTaskAsync(PREFETCH_PYQ_TASK, {
        minimumInterval: 12 * 60, // Run roughly every 12 hours
      });
    }
  } catch (e) {
    if (__DEV__) console.warn('Failed to register PYQ background task:', e);
  }
}
