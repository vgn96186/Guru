import type { AIContent, ContentType, TopicWithProgress } from '../../types';
import { SYSTEM_PROMPT, CONTENT_PROMPT_MAP } from '../../constants/prompts';
import { getCachedContent, setCachedContent } from '../../db/queries/aiCache';
import type { Message } from './types';
import { AIContentSchema } from './schemas';
import { generateJSONWithRouting } from './generate';

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

  const { parsed, modelUsed } = await generateJSONWithRouting<AIContent>(
    messages,
    AIContentSchema,
    'low',
  );
  await setCachedContent(topic.id, contentType, parsed, modelUsed);
  return parsed;
}

export async function prefetchTopicContent(
  topic: TopicWithProgress,
  contentTypes: ContentType[],
): Promise<void> {
  await Promise.allSettled(contentTypes.map((ct) => fetchContent(topic, ct)));
}
