import type {
  AIContent,
  ContentType,
  TopicWithProgress,
  QuizContent,
  SaveQuestionInput,
  FlashcardsContent,
} from '../../types';
import { SYSTEM_PROMPT, CONTENT_PROMPT_MAP, buildEscalatingQuizPrompt } from '../../constants/prompts';
import { getCachedContent, setCachedContent } from '../../db/queries/aiCache';
import { saveBulkQuestions } from '../../db/queries/questionBank';
import { AIContentSchema, QuizSchema } from './schemas';
import { generateObject } from 'ai';
import { createGuruFallbackModel } from './providers/guruFallback';
import { profileRepository } from '../../db/repositories/profileRepository';
import { searchMedicalImages } from './medicalSearch';
import type { Message as CoreMessage } from './types';

const inFlightContentRequests = new Map<string, Promise<AIContent>>();

function isRenderableQuizImageUrl(url?: string | null): boolean {
  const t = url?.trim();
  if (!t) return false;
  return /^https?:\/\//i.test(t);
}

function getContentRequestKey(topicId: number, contentType: ContentType): string {
  return `${topicId}:${contentType}`;
}

function buildMasteryAdaptivePromptContext(topic: TopicWithProgress): string {
  const status = topic.progress?.status ?? 'unseen';
  const confidence = topic.progress?.confidence ?? 0;
  const wrongCount = topic.progress?.wrongCount ?? 0;
  const isGapHeavy =
    status === 'unseen' || confidence <= 1 || wrongCount >= 2 || Boolean(topic.progress?.isNemesis);

  if (isGapHeavy) {
    return `
ADAPTIVE TEACHING CONTEXT:
- Student has foundational gaps on this topic.
- Explain using prerequisite-first progression: basics -> mechanism -> exam clue.
- Define any technical term in plain language before using it.
- Avoid assuming prior technical understanding.
- Keep exam focus on high-yield must-know discriminators.`;
  }

  if (confidence <= 2 || status === 'reviewed' || status === 'seen') {
    return `
ADAPTIVE TEACHING CONTEXT:
- Student has partial mastery.
- Give concise revision-style explanations with one-line prerequisite refreshers where needed.
- Emphasize high-yield traps and commonly confused options.`;
  }

  return `
ADAPTIVE TEACHING CONTEXT:
- Student is relatively strong in this topic.
- Keep content advanced, exam-focused, and high-yield with tricky discriminators.`;
}

function hasObviousCutOff(text: string, requireSentenceEnd = false): boolean {
  const t = text.trim();
  if (!t) return true;
  const boldMarkerCount = (t.match(/\*\*/g) ?? []).length;
  if (boldMarkerCount % 2 !== 0) return true;
  if (/[A-Za-z0-9]+-$/.test(t)) return true;
  if (/[([{"'`]$/.test(t)) return true;
  const openParens = (t.match(/\(/g) ?? []).length;
  const closeParens = (t.match(/\)/g) ?? []).length;
  if (openParens > closeParens) return true;
  if (requireSentenceEnd && t.length >= 70 && !/[.!?]["')\]]?$/.test(t)) return true;
  return false;
}

function isLikelyIncompleteAiContent(content: AIContent): boolean {
  switch (content.type) {
    case 'keypoints':
      return (
        content.points.length < 2 ||
        content.points.some((point) => hasObviousCutOff(point, false)) ||
        content.memoryHook.trim().length < 8 ||
        hasObviousCutOff(content.memoryHook, true)
      );
    case 'must_know':
      return (
        content.mustKnow.length < 2 ||
        content.mostTested.length < 2 ||
        content.mustKnow.some((item) => hasObviousCutOff(item, false)) ||
        content.mostTested.some((item) => hasObviousCutOff(item, false)) ||
        content.examTip.trim().length < 10 ||
        hasObviousCutOff(content.examTip, true)
      );
    case 'quiz':
      return (
        content.questions.length < 2 ||
        content.questions.some(
          (question) =>
            question.options.length !== 4 ||
            question.explanation.trim().length < 15 ||
            question.question.trim().length < 10 ||
            hasObviousCutOff(question.question, true) ||
            hasObviousCutOff(question.explanation, true),
        )
      );
    case 'story':
      return (
        content.story.trim().length < 60 ||
        hasObviousCutOff(content.story, true) ||
        content.keyConceptHighlights.length < 1
      );
    case 'mnemonic':
      return (
        content.expansion.length < 2 ||
        content.expansion.some((entry) => hasObviousCutOff(entry, false)) ||
        content.tip.trim().length < 10 ||
        hasObviousCutOff(content.tip, true)
      );
    case 'teach_back':
      return (
        content.keyPointsToMention.length < 2 ||
        content.keyPointsToMention.some((entry) => hasObviousCutOff(entry, false)) ||
        content.prompt.trim().length < 10 ||
        hasObviousCutOff(content.prompt, true) ||
        hasObviousCutOff(content.guruReaction, true)
      );
    case 'error_hunt':
      return (
        content.errors.length < 2 ||
        content.paragraph.trim().length < 80 ||
        hasObviousCutOff(content.paragraph, true) ||
        content.errors.some(
          (entry) =>
            hasObviousCutOff(entry.wrong, false) ||
            hasObviousCutOff(entry.correct, false) ||
            hasObviousCutOff(entry.explanation, true),
        )
      );
    case 'detective':
      return (
        content.clues.length < 2 ||
        content.clues.some((clue) => hasObviousCutOff(clue, false)) ||
        content.explanation.trim().length < 20 ||
        hasObviousCutOff(content.explanation, true)
      );
    case 'socratic':
      return (
        content.questions.length < 3 ||
        content.questions.some(
          (question) =>
            question.question.trim().length < 12 ||
            question.answer.trim().length < 20 ||
            question.whyItMatters.trim().length < 12 ||
            hasObviousCutOff(question.question, true) ||
            hasObviousCutOff(question.answer, true) ||
            hasObviousCutOff(question.whyItMatters, true),
        )
      );
    case 'flashcards':
      return (
        content.cards.length < 3 ||
        content.cards.some(
          (card) =>
            card.front.trim().length < 5 ||
            card.back.trim().length < 5 ||
            hasObviousCutOff(card.front, false) ||
            hasObviousCutOff(card.back, false),
        )
      );
    default:
      return false;
  }
}

export async function fetchContent(
  topic: TopicWithProgress,
  contentType: ContentType,
  forceProvider?: 'groq' | 'gemini',
): Promise<AIContent> {
  const cached = await getCachedContent(topic.id, contentType);
  if (cached) {
    if (cached.type === 'quiz') {
      const hydrated = (await resolveQuizImages(
        cached as QuizContent & { modelUsed?: string },
      )) as AIContent & { modelUsed?: string };
      const beforeQ = JSON.stringify((cached as QuizContent).questions);
      const afterQ = JSON.stringify((hydrated as QuizContent).questions);
      if (afterQ !== beforeQ) {
        await setCachedContent(
          topic.id,
          contentType,
          hydrated,
          (hydrated.modelUsed ?? 'cache').trim() || 'cache',
        );
      }
      return hydrated;
    }
    if (cached.type === 'flashcards') {
      const hydrated = (await resolveFlashcardImages(
        cached as FlashcardsContent & { modelUsed?: string },
      )) as AIContent & { modelUsed?: string };
      const beforeCards = JSON.stringify((cached as { cards: unknown }).cards);
      const afterCards = JSON.stringify((hydrated as { cards: unknown }).cards);
      if (afterCards !== beforeCards) {
        await setCachedContent(
          topic.id,
          contentType,
          hydrated,
          (hydrated.modelUsed ?? 'cache').trim() || 'cache',
        );
      }
      return hydrated;
    }
    return cached;
  }

  const requestKey = getContentRequestKey(topic.id, contentType);
  const inFlight = inFlightContentRequests.get(requestKey);
  if (inFlight) return inFlight;

  const request = (async () => {
    const promptFn = CONTENT_PROMPT_MAP[contentType];
    const userPrompt = `${promptFn(topic.name, topic.subjectName)}${buildMasteryAdaptivePromptContext(topic)}`;
    const messages: CoreMessage[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ];
    const profile = await profileRepository.getProfile();
    const model = createGuruFallbackModel({ profile });
    let modelUsed = '';
    let contentWithMeta: AIContent | null = null;

    const maxAttempts = 3;
    let lastContent: AIContent | null = null;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const generated = await generateObject({ model, messages, schema: AIContentSchema });
      modelUsed = `${model.provider}/${model.modelId}`;
      contentWithMeta = { ...generated.object, modelUsed } as AIContent;
      if (contentWithMeta.type === 'quiz') {
        contentWithMeta = (await resolveQuizImages(
          contentWithMeta as QuizContent & { modelUsed?: string },
        )) as AIContent;
      } else if (contentWithMeta.type === 'flashcards') {
        contentWithMeta = (await resolveFlashcardImages(
          contentWithMeta as FlashcardsContent & { modelUsed?: string },
        )) as AIContent;
      }
      lastContent = contentWithMeta;
      if (!isLikelyIncompleteAiContent(contentWithMeta)) {
        break;
      }
      if (attempt >= maxAttempts) {
        // Use last attempt even if incomplete — better than showing nothing
        if (__DEV__) {
          console.warn(
            '[AIContent] Using potentially incomplete content after all retries exhausted',
            {
              topicId: topic.id,
              contentType,
              modelUsed,
            },
          );
        }
        contentWithMeta = lastContent;
        break;
      }
      if (__DEV__) {
        console.warn('[AIContent] Incomplete content detected, retrying', {
          topicId: topic.id,
          contentType,
          attempt,
          maxAttempts,
          modelUsed,
        });
      }
      contentWithMeta = null;
    }

    if (!contentWithMeta) {
      throw new Error(`Failed to generate ${contentType} content for ${topic.name}`);
    }

    await setCachedContent(topic.id, contentType, contentWithMeta, modelUsed);

    if (contentWithMeta.type === 'quiz') {
      const quiz = contentWithMeta as QuizContent;
      const inputs: SaveQuestionInput[] = quiz.questions.map((q) => ({
        question: q.question,
        options: q.options,
        correctIndex: q.correctIndex,
        explanation: q.explanation,
        topicId: topic.id,
        topicName: topic.name,
        subjectName: topic.subjectName,
        source: 'content_card',
        imageUrl: q.imageUrl ?? null,
      }));
      saveBulkQuestions(inputs).catch((err) => {
        if (__DEV__) console.warn('[QuestionBank] Auto-save from content failed:', err);
      });
    }

    return contentWithMeta;
  })();

  inFlightContentRequests.set(requestKey, request);
  try {
    return await request;
  } finally {
    inFlightContentRequests.delete(requestKey);
  }
}

function stripImageFramingFromStem(text: string): string {
  return text
    .replace(
      /\b(Based on|Referring to|Looking at|In) the (image|imaging study|photograph|micrograph|radiograph|X-ray|CT scan|MRI|ECG|histology|slide) (shown|displayed|provided|above|below)[.,]?\s*/gi,
      '',
    )
    .replace(
      /The following (imaging study|image|photograph|radiograph|micrograph) (demonstrates|shows|reveals)[.:]\s*/gi,
      '',
    )
    .replace(/^\s*[.,]\s*/, '');
}

/**
 * Resolve imageSearchQuery fields in quiz questions to actual image URLs.
 * Runs searches in parallel, populates `imageUrl` on each question that has a query.
 */
async function resolveQuizImages<T extends QuizContent>(quiz: T): Promise<T> {
  const sanitized = {
    ...quiz,
    questions: quiz.questions.map((q) => ({
      ...q,
      imageUrl: isRenderableQuizImageUrl(q.imageUrl) ? q.imageUrl!.trim() : undefined,
    })),
  } as T;

  const questionsWithQuery = sanitized.questions
    .map((q, i) => ({ q, i }))
    .filter(
      ({ q }) =>
        Boolean(q.imageSearchQuery?.trim()) && !isRenderableQuizImageUrl(q.imageUrl ?? null),
    );

  if (questionsWithQuery.length === 0) return sanitized;

  const results = await Promise.allSettled(
    questionsWithQuery.map(({ q }) => searchMedicalImages(q.imageSearchQuery!, 1)),
  );

  const updatedQuestions = [...sanitized.questions];
  questionsWithQuery.forEach(({ i }, idx) => {
    const result = results[idx];
    if (result.status === 'fulfilled' && result.value.length > 0) {
      const url = (result.value[0].imageUrl ?? result.value[0].url)?.trim();
      if (url && isRenderableQuizImageUrl(url)) {
        updatedQuestions[i] = {
          ...updatedQuestions[i],
          imageUrl: url,
          imageSearchQuery: undefined,
        };
      } else {
        const q = updatedQuestions[i];
        updatedQuestions[i] = {
          ...q,
          imageSearchQuery: undefined,
          question: stripImageFramingFromStem(q.question),
        };
      }
    } else {
      // Image search failed — strip image-referencing language from the question text
      // so it doesn't confuse the student with "Based on the image shown..." when there's no image.
      const q = updatedQuestions[i];
      updatedQuestions[i] = {
        ...q,
        imageSearchQuery: undefined,
        question: stripImageFramingFromStem(q.question),
      };
    }
  });

  return { ...sanitized, questions: updatedQuestions };
}

async function resolveFlashcardImages<T extends Extract<AIContent, { type: 'flashcards' }>>(
  flashcards: T,
): Promise<T> {
  const sanitized = {
    ...flashcards,
    cards: flashcards.cards.map((card) => ({
      ...card,
      imageUrl: isRenderableQuizImageUrl(card.imageUrl) ? card.imageUrl!.trim() : undefined,
    })),
  } as T;

  const cardsWithQuery = sanitized.cards
    .map((card, i) => ({ card, i }))
    .filter(
      ({ card }) =>
        Boolean(card.imageSearchQuery?.trim()) && !isRenderableQuizImageUrl(card.imageUrl ?? null),
    );

  if (cardsWithQuery.length === 0) return sanitized;

  const results = await Promise.allSettled(
    cardsWithQuery.map(({ card }) => searchMedicalImages(card.imageSearchQuery!, 1)),
  );

  const updatedCards = [...sanitized.cards];
  cardsWithQuery.forEach(({ i }, idx) => {
    const result = results[idx];
    if (result.status === 'fulfilled' && result.value.length > 0) {
      const url = (result.value[0].imageUrl ?? result.value[0].url)?.trim();
      if (url && isRenderableQuizImageUrl(url)) {
        updatedCards[i] = {
          ...updatedCards[i],
          imageUrl: url,
          imageSearchQuery: undefined,
        };
        return;
      }
    }

    updatedCards[i] = {
      ...updatedCards[i],
      imageSearchQuery: undefined,
    };
  });

  return { ...sanitized, cards: updatedCards };
}

export async function generateEscalatingQuiz(
  topicName: string,
  subjectName: string,
  round: number,
  previouslyWrong: string[],
): Promise<QuizContent> {
  const userPrompt = buildEscalatingQuizPrompt(topicName, subjectName, round, previouslyWrong);
  const messages: CoreMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: userPrompt },
  ];
  const profile = await profileRepository.getProfile();
  const model = createGuruFallbackModel({ profile });
  const generated = await generateObject({ model, messages, schema: QuizSchema });
  const modelUsed = `${model.provider}/${model.modelId}`;
  return { ...generated.object, modelUsed } as QuizContent;
}

export async function prefetchTopicContent(
  topic: TopicWithProgress,
  contentTypes: ContentType[],
  forceProvider?: 'groq' | 'gemini',
): Promise<void> {
  await Promise.allSettled(contentTypes.map((ct) => fetchContent(topic, ct, forceProvider)));
}
