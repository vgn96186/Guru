import type { AIContent, ContentType, TopicWithProgress, QuizContent } from '../../types';
import { SYSTEM_PROMPT, CONTENT_PROMPT_MAP } from '../../constants/prompts';
import { getCachedContent, setCachedContent } from '../../db/queries/aiCache';
import type { Message } from './types';
import { AIContentSchema } from './schemas';
import { generateJSONWithRouting } from './generate';
import { searchMedicalImages } from './medicalSearch';

export async function fetchContent(
  topic: TopicWithProgress,
  contentType: ContentType,
): Promise<AIContent> {
  const cached = await getCachedContent(topic.id, contentType);
  if (cached) return cached;

  const promptFn = CONTENT_PROMPT_MAP[contentType];
  const userPrompt = promptFn(topic.name, topic.subjectName);
  const messages: Message[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: userPrompt },
  ];

  const { parsed, modelUsed } = await generateJSONWithRouting(
    messages,
    AIContentSchema,
    'low',
  );
  let contentWithMeta = { ...parsed, modelUsed } as AIContent;
  if (contentWithMeta.type === 'quiz') {
    contentWithMeta = await resolveQuizImages(contentWithMeta as QuizContent & { modelUsed?: string }) as AIContent;
  }
  await setCachedContent(topic.id, contentType, contentWithMeta, modelUsed);
  return contentWithMeta;
}

/**
 * Resolve imageSearchQuery fields in quiz questions to actual image URLs.
 * Runs searches in parallel, populates `imageUrl` on each question that has a query.
 */
async function resolveQuizImages<T extends QuizContent>(quiz: T): Promise<T> {
  const questionsWithQuery = quiz.questions
    .map((q, i) => ({ q, i }))
    .filter(({ q }) => q.imageSearchQuery);

  if (questionsWithQuery.length === 0) return quiz;

  const results = await Promise.allSettled(
    questionsWithQuery.map(({ q }) => searchMedicalImages(q.imageSearchQuery!, 1)),
  );

  const updatedQuestions = [...quiz.questions];
  questionsWithQuery.forEach(({ i }, idx) => {
    const result = results[idx];
    if (result.status === 'fulfilled' && result.value.length > 0) {
      updatedQuestions[i] = {
        ...updatedQuestions[i],
        imageUrl: result.value[0].imageUrl ?? result.value[0].url,
      };
    }
  });

  return { ...quiz, questions: updatedQuestions };
}

export async function prefetchTopicContent(
  topic: TopicWithProgress,
  contentTypes: ContentType[],
): Promise<void> {
  await Promise.allSettled(contentTypes.map((ct) => fetchContent(topic, ct)));
}
