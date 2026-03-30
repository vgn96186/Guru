import { z } from 'zod';
import { SYSTEM_PROMPT } from '../../constants/prompts';
import { DEFAULT_PROVIDER_ORDER } from '../../types';
import type { MedicalGroundingSource, Message } from './types';
import {
  generateJSONWithRouting,
  generateTextWithRouting,
  generateTextWithRoutingStream,
} from './generate';
import {
  searchLatestMedicalSources,
  searchMedicalImages,
  generateImageSearchQuery,
  dedupeGroundingSources,
  renderSourcesForPrompt,
  clipText,
  buildMedicalSearchQuery,
} from './medicalSearch';
import { logGroundingEvent, previewText } from './runtimeDebug';

const MAX_CONTINUATION_ATTEMPTS = 2;

const GURU_ADHD_FORMATTING_RULES = `Formatting rules:
- Keep normal text plain. Use markdown bold only for the 3 or 4 most critical medical terms in a concept.
- Keep paragraphs short: 1 or 2 sentences maximum per paragraph.
- Leave a blank line between distinct thoughts or sections.
- Do not use tables.
- Do not turn the whole reply into a long list unless the content truly needs a list.
- If you ask the student anything, put it alone on the final line prefixed exactly with "Question:".`;

function buildGuruSystemPrompt(options: { grounded?: boolean; includeStudyContext?: boolean }) {
  const promptLines = [
    'You are Guru, a Socratic medical tutor for NEET-PG/INICET. Guide the student to discover answers - never lecture.',
    'Rules:',
    '1) Ask ONE focused clinical question per response. No information dumps.',
    '2) If the student answers, react in one sentence (affirm or correct briefly), then ask the next logical question.',
    options.grounded
      ? '3) Use your medical knowledge as the PRIMARY basis for answers. Sources below are supplementary references only - ignore irrelevant ones.'
      : '3) Focus only on high-yield exam facts - ignore rare minutiae.',
    '4) Be warm, calm, and concise.',
    '5) Prioritize forward progress over quizzing. If the student is uncertain, give the next important teaching point directly instead of asking another near-identical question.',
    '6) If the student says "just tell me", "explain it", or "don\'t know", do not repeat the same question. Give a brief direct explanation, then continue with the rest of the concept before asking at most one simpler checkpoint question only if it truly helps.',
    options.grounded
      ? '7) Do not use citations inline - keep it natural, not academic.'
      : options.includeStudyContext
        ? '7) Use the STUDY CONTEXT when it is provided so your answer matches the exact card, question, or explanation the student is viewing.'
        : '7) Never output JSON.',
    options.grounded
      ? '8) NEVER refuse to answer a medical question. Always provide your best knowledge even if sources are unavailable or irrelevant.'
      : options.includeStudyContext
        ? '8) Never output JSON.'
        : "8) Output only Guru's next single turn. Never write Student:/User:/Guru: role labels and never invent the student's reply.",
    options.grounded || options.includeStudyContext
      ? "9) Output only Guru's next single turn. Never write Student:/User:/Guru: role labels and never invent the student's reply."
      : '9) If you ask a question, that question must be the final line in your reply. Never answer your own question.',
    options.grounded || options.includeStudyContext
      ? '10) Never ask the same or nearly the same question again if it was already asked in recent turns. Build on the conversation state instead.'
      : null,
    options.grounded || options.includeStudyContext
      ? '11) If the student has already failed or declined to answer a point, do not quiz them on that same point again in the next turn. Teach it and move on.'
      : null,
    options.grounded || options.includeStudyContext
      ? '12) If you ask a question, that question must be the final line in your reply. Never answer your own question.'
      : '10) Follow these output constraints exactly:',
    options.grounded || options.includeStudyContext
      ? '13) Follow these output constraints exactly:'
      : null,
    GURU_ADHD_FORMATTING_RULES,
  ];

  return promptLines.filter(Boolean).join('\n');
}

function buildTopicContextLine(topicName?: string, syllabusTopicId?: number): string | null {
  const normalizedTopic = topicName?.trim();
  if (!normalizedTopic && syllabusTopicId == null) return null;
  if (normalizedTopic && syllabusTopicId != null) {
    return `Topic context: ${normalizedTopic} (syllabus topic id ${syllabusTopicId})`;
  }
  if (normalizedTopic) {
    return `Topic context: ${normalizedTopic}`;
  }
  return `Syllabus topic id: ${syllabusTopicId}`;
}

function isLowInformationImagePrompt(text: string): boolean {
  const normalized = text.trim().toLowerCase();
  if (!normalized) return true;
  const tokens = normalized.split(/\s+/).filter(Boolean);
  if (normalized.length <= 3) return true;
  if (
    tokens.length <= 2 &&
    tokens.every((token) =>
      [
        'left',
        'right',
        'upper',
        'lower',
        'medial',
        'lateral',
        'anterior',
        'posterior',
        'proximal',
        'distal',
        'superior',
        'inferior',
        'yes',
        'no',
        'true',
        'false',
      ].includes(token),
    )
  ) {
    return true;
  }
  return [
    "don't know",
    'dont know',
    'do not know',
    'explain',
    'continue',
    'quiz me',
    'change topic',
    'ok',
    'okay',
    'yes',
    'no',
  ].includes(normalized);
}

function buildImageSearchSeed(
  question: string,
  topicName: string | undefined,
  history: Array<{ role: 'user' | 'guru'; text: string }>,
): { topic: string; context?: string } | null {
  const trimmedQuestion = question.trim();
  const recentUserPrompt = [...history]
    .reverse()
    .find(
      (entry) =>
        entry.role === 'user' &&
        !isLowInformationImagePrompt(entry.text) &&
        entry.text.trim().length >= 8,
    )
    ?.text.trim();
  const recentGuruReply = [...history]
    .reverse()
    .find((entry) => entry.role === 'guru' && entry.text.trim().length >= 16)
    ?.text.trim();

  if (!isLowInformationImagePrompt(trimmedQuestion)) {
    return {
      topic: (topicName?.trim() || trimmedQuestion).slice(0, 120),
      context: [
        topicName?.trim() ? `Topic: ${topicName.trim()}` : null,
        recentUserPrompt ? `Earlier student question: ${clipText(recentUserPrompt, 220)}` : null,
        recentGuruReply ? `Tutor context: ${clipText(recentGuruReply, 260)}` : null,
        `Latest student message: ${clipText(trimmedQuestion, 160)}`,
      ]
        .filter(Boolean)
        .join('\n'),
    };
  }

  if (recentUserPrompt) {
    return {
      topic: (topicName?.trim() || recentUserPrompt).slice(0, 120),
      context: [
        topicName?.trim() ? `Topic: ${topicName.trim()}` : null,
        `Earlier student question: ${clipText(recentUserPrompt, 220)}`,
        recentGuruReply ? `Tutor context: ${clipText(recentGuruReply, 260)}` : null,
        `Latest student message: ${clipText(trimmedQuestion, 160)}`,
      ]
        .filter(Boolean)
        .join('\n'),
    };
  }

  if (topicName?.trim()) {
    return {
      topic: topicName.trim().slice(0, 120),
      context: recentGuruReply
        ? `Topic: ${topicName.trim()}\nTutor context: ${clipText(recentGuruReply, 260)}\nLatest student message: ${clipText(trimmedQuestion, 160)}`
        : `Topic: ${topicName.trim()}\nLatest student message: ${clipText(trimmedQuestion, 160)}`,
    };
  }

  return null;
}

function isRenderableReferenceImageUrl(url: string | undefined): boolean {
  const trimmed = url?.trim();
  if (!trimmed) return false;
  if (!/^https?:\/\//i.test(trimmed)) return false;
  return !/\.(pdf|svg|djvu?|tiff?)(?:[?#]|$)/i.test(trimmed);
}

function sanitizeSingleGuruTurn(raw: string): string {
  let text = (raw ?? '').replace(/\r/g, '').trim();
  if (!text) return '';

  text = text.replace(/^(?:guru|assistant)\s*:\s*/i, '').trim();

  const firstStudentTurn = text.search(/(?:^|\n|\s)(?:student|user|learner)\s*:/i);
  if (firstStudentTurn >= 0) {
    text = text.slice(0, firstStudentTurn).trim();
  }

  const secondGuruTurn = text.search(/(?:^|\n|\s)(?:guru|assistant)\s*:/i);
  if (secondGuruTurn >= 0) {
    text = text.slice(0, secondGuruTurn).trim();
  }

  text = truncateAfterAskedQuestion(text);

  return text;
}

const QUESTION_PREFIX_RE = /^question:\s*/i;
const QUESTION_STOPWORDS = new Set([
  'a',
  'an',
  'are',
  'be',
  'called',
  'can',
  'do',
  'does',
  'for',
  'how',
  'if',
  'in',
  'is',
  'it',
  'its',
  'of',
  'on',
  'or',
  'the',
  'their',
  'this',
  'to',
  'what',
  'when',
  'where',
  'which',
  'who',
  'why',
  'your',
]);

function splitReplyAndFinalQuestion(text: string): { body: string; question: string | null } {
  const trimmed = text.trim();
  if (!trimmed) return { body: '', question: null };

  const explicitQuestionMatch = trimmed.match(/(?:^|[\n\r])\s*question:\s*([\s\S]+?)\s*$/i);
  if (explicitQuestionMatch) {
    const fullMatch = explicitQuestionMatch[0] ?? '';
    return {
      body: trimmed.slice(0, trimmed.length - fullMatch.length).trim(),
      question: explicitQuestionMatch[1]?.trim() || null,
    };
  }

  const finalQuestionIndex = trimmed.lastIndexOf('?');
  if (finalQuestionIndex === -1) {
    return { body: trimmed, question: null };
  }

  const questionPrefixIndex = trimmed.toLowerCase().lastIndexOf('question:', finalQuestionIndex);
  if (questionPrefixIndex >= 0) {
    return {
      body: trimmed.slice(0, questionPrefixIndex).trim(),
      question: trimmed.slice(questionPrefixIndex).replace(QUESTION_PREFIX_RE, '').trim(),
    };
  }

  const boundaryIndex = Math.max(
    trimmed.lastIndexOf('\n', finalQuestionIndex),
    trimmed.lastIndexOf('. ', finalQuestionIndex),
    trimmed.lastIndexOf('! ', finalQuestionIndex),
  );

  if (boundaryIndex === -1) {
    return { body: '', question: trimmed };
  }

  const question = trimmed.slice(boundaryIndex + 1).trim();
  if (!question.endsWith('?')) {
    return { body: trimmed, question: null };
  }

  return {
    body: trimmed.slice(0, boundaryIndex + 1).trim(),
    question,
  };
}

function normalizeQuestionText(text: string): string {
  return text
    .toLowerCase()
    .replace(QUESTION_PREFIX_RE, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractKeyTerms(text: string): string[] {
  return Array.from(
    new Set(
      normalizeQuestionText(text)
        .split(' ')
        .map((term) => term.trim())
        .filter((term) => term.length >= 3 && !QUESTION_STOPWORDS.has(term)),
    ),
  );
}

function shouldDropFinalQuestion(reply: string, recentQuestions: string[] = []): boolean {
  const { body, question } = splitReplyAndFinalQuestion(reply);
  if (!question || !body) return false;

  const normalizedQuestion = normalizeQuestionText(question);
  if (!normalizedQuestion) return false;

  if (recentQuestions.some((asked) => normalizeQuestionText(asked) === normalizedQuestion)) {
    return true;
  }

  const bodyTerms = new Set(extractKeyTerms(body));
  const questionTerms = extractKeyTerms(question);
  if (questionTerms.length === 0) return false;

  const overlapCount = questionTerms.filter((term) => bodyTerms.has(term)).length;
  const overlapRatio = overlapCount / questionTerms.length;

  const directAnswerCue =
    /\b(is|are|means|refers to|called|supplied by|innervated by|causes|because|therefore|so)\b/i.test(
      body,
    ) || /[.!]\s*$/.test(body);

  return overlapRatio >= 0.6 && directAnswerCue;
}

function finalizeGuruReply(reply: string, recentQuestions: string[] = []): string {
  const sanitized = sanitizeSingleGuruTurn(reply);
  if (!sanitized) return sanitized;
  if (!shouldDropFinalQuestion(sanitized, recentQuestions)) return sanitized;
  return splitReplyAndFinalQuestion(sanitized).body.trim();
}

function truncateAfterAskedQuestion(text: string): string {
  const firstQuestionIndex = text.indexOf('?');
  if (firstQuestionIndex === -1) return text;
  const trailing = text.slice(firstQuestionIndex + 1).trim();
  if (!trailing) return text;

  const hasAnotherQuestion = trailing.includes('?');
  const startsLikeContinuationAnswer =
    /^[A-Z0-9*_(["']/.test(trailing) ||
    /^(the|it|they|this|that|these|those|because|so|therefore|plasma|interstitial|answer)\b/i.test(
      trailing,
    );

  if (hasAnotherQuestion || startsLikeContinuationAnswer) {
    return text.slice(0, firstQuestionIndex + 1).trim();
  }

  return text;
}

function looksTruncatedReply(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  if (t.includes('?')) return false;
  if (/\*\*[^*]*$/.test(t)) return true;
  if (/[A-Za-z0-9]+-$/.test(t)) return true;
  if (/[([{"'`]$/.test(t)) return true;
  const openParens = (t.match(/\(/g) ?? []).length;
  const closeParens = (t.match(/\)/g) ?? []).length;
  if (openParens > closeParens) return true;
  if (t.length >= 320 && !/[.!?]["')\]]?$/.test(t)) return true;
  return false;
}

function hasUsefulContinuation(base: string, continuation: string): boolean {
  const c = continuation.trim();
  if (!c) return false;
  if (c.length < 8) return false;
  if (base.includes(c)) return false;
  if (looksLikeRestartedReply(base, c)) return false;
  return true;
}

function normalizeWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[*_`()[\]{}:;,.!?'"\\/-]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

function hasTailPrefixOverlap(base: string, continuation: string): boolean {
  const baseWords = normalizeWords(base).slice(-6);
  const continuationWords = normalizeWords(continuation).slice(0, 8);
  const maxLen = Math.min(baseWords.length, continuationWords.length, 4);
  for (let len = maxLen; len >= 2; len -= 1) {
    const baseSlice = baseWords.slice(-len).join(' ');
    const continuationSlice = continuationWords.slice(0, len).join(' ');
    if (baseSlice && baseSlice === continuationSlice) return true;
  }
  return false;
}

function looksLikeRestartedReply(base: string, continuation: string): boolean {
  const trimmedBase = base.trim();
  const trimmedContinuation = continuation.trim();
  if (!trimmedBase || !trimmedContinuation) return false;
  if (/[.!?]["')\]]?$/.test(trimmedBase)) return false;
  if (hasTailPrefixOverlap(trimmedBase, trimmedContinuation)) return false;
  return /^(correct|exactly|yes|no|the\b|this\b|that\b|remember\b|it\b|both\b|\*\*)/i.test(
    trimmedContinuation,
  );
}

function appendContinuation(base: string, continuation: string): string {
  const b = base.trimEnd();
  const c = continuation.trim();
  if (!c) return b;
  if (/^[,.;:!?)}\]]/.test(c) || b.endsWith(' ')) return `${b}${c}`;
  return `${b} ${c}`;
}

function buildContinuationMessages(base: Message[], partialReply: string): Message[] {
  const trailingExcerpt = partialReply.trim().slice(-120);
  return [
    ...base,
    { role: 'assistant', content: partialReply },
    {
      role: 'user',
      content: `Continue exactly from where your previous reply stopped.
Do not restart the answer.
Do not repeat any prior text.
Do not answer the student's earlier question from scratch.
Return only the missing continuation that comes immediately after this trailing excerpt:
"${trailingExcerpt}"`,
    },
  ];
}

function buildHistoryMessages(
  history: Array<{ role: 'user' | 'guru'; text: string }>,
  limit: number,
): Message[] {
  return history.slice(-limit).map((entry) => ({
    role: entry.role === 'user' ? 'user' : 'assistant',
    content: clipText(entry.text, 280),
  }));
}

function extractRecentGuruQuestions(
  history: Array<{ role: 'user' | 'guru'; text: string }>,
  limit = 4,
): string[] {
  const seen = new Set<string>();
  const questions: string[] = [];

  for (let i = history.length - 1; i >= 0 && questions.length < limit; i -= 1) {
    const entry = history[i];
    if (entry.role !== 'guru') continue;

    const explicitQuestions = entry.text
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => /^question:\s*/i.test(line))
      .map((line) => line.replace(/^question:\s*/i, '').trim());

    const fallbackQuestion =
      explicitQuestions.length === 0 && /\?\s*$/.test(entry.text.trim())
        ? (entry.text
            .trim()
            .split('\n')
            .pop()
            ?.trim()
            .replace(/^question:\s*/i, '') ?? '')
        : '';

    for (const candidate of [...explicitQuestions, fallbackQuestion].filter(Boolean)) {
      const normalized = candidate.toLowerCase();
      if (seen.has(normalized)) continue;
      seen.add(normalized);
      questions.push(candidate);
      if (questions.length >= limit) break;
    }
  }

  return questions.reverse();
}

function mapGroundedChatError(error: unknown): Error {
  const msg = error instanceof Error ? error.message : String(error);
  if (__DEV__) console.warn('[GuruGrounded] Generation failed:', msg);
  if (
    typeof msg === 'string' &&
    msg.toLowerCase().includes('invalid') &&
    msg.toLowerCase().includes('key')
  ) {
    return new Error(
      'Invalid API key. Check Settings or .env (EXPO_PUBLIC_BUNDLED_GROQ_KEY). Restart with: npx expo start --clear',
    );
  }
  if (
    typeof msg === 'string' &&
    (msg.includes('429') || msg.toLowerCase().includes('rate limit'))
  ) {
    return new Error('Rate limit hit. Wait a minute or try again.');
  }
  return new Error(`Guru couldn't respond: ${String(msg).slice(0, 120)}`);
}

export async function chatWithGuru(
  question: string,
  topicName: string,
  history: Array<{ role: 'user' | 'guru'; text: string }>,
  chosenModel?: string,
  studyContext?: string,
): Promise<{ reply: string }> {
  const recentGuruQuestions = extractRecentGuruQuestions(history);
  const contextPrompt = `Topic: ${topicName}${
    studyContext ? `\n\nStudy context:\n${studyContext}` : ''
  }`;
  const systemPrompt = buildGuruSystemPrompt({ includeStudyContext: true });
  const { text } = await generateTextWithRouting(
    [
      { role: 'system', content: systemPrompt },
      { role: 'system', content: contextPrompt },
      ...buildHistoryMessages(history, 4),
      { role: 'user', content: question },
    ],
    { chosenModel, providerOrderOverride: DEFAULT_PROVIDER_ORDER },
  );
  return { reply: finalizeGuruReply(text, recentGuruQuestions) };
}

export async function chatWithGuruGrounded(
  question: string,
  topicName: string | undefined,
  history: Array<{ role: 'user' | 'guru'; text: string }>,
  chosenModel?: string,
): Promise<import('./types').GroundedGuruResponse> {
  const trimmedQuestion = question.replace(/\s+/g, ' ').trim();
  const searchQuery = buildMedicalSearchQuery(trimmedQuestion, topicName);
  const sources = await searchLatestMedicalSources(searchQuery, 6);
  const recentGuruQuestions = extractRecentGuruQuestions(history);

  const sourcesBlock =
    sources.length > 0
      ? renderSourcesForPrompt(sources)
      : 'No live web sources were retrieved for this query.';

  const systemPrompt = buildGuruSystemPrompt({ grounded: true });

  const topicContextLine = buildTopicContextLine(topicName);
  const userPrompt = `${topicContextLine ? `${topicContextLine}\n` : ''}Student question: ${trimmedQuestion}
${recentGuruQuestions.length > 0 ? `\nRecent Guru questions already asked - do not repeat or paraphrase them:\n${recentGuruQuestions.map((q, i) => `${i + 1}. ${q}`).join('\n')}\n` : ''}
${sources.length > 0 ? `\nSUPPLEMENTARY REFERENCES (use only if relevant):\n${sourcesBlock}` : ''}
Respond using your medical knowledge. Reference the sources only if they are directly relevant.`;

  const msgs: Message[] = [
    { role: 'system', content: systemPrompt },
    ...buildHistoryMessages(history, 6),
    { role: 'user', content: userPrompt },
  ];

  try {
    const response = await generateTextWithRouting(msgs, {
      chosenModel,
      providerOrderOverride: DEFAULT_PROVIDER_ORDER,
    });
    let finalReply = finalizeGuruReply(response.text, recentGuruQuestions);
    let modelUsed = response.modelUsed;
    for (let attempt = 1; attempt <= MAX_CONTINUATION_ATTEMPTS; attempt += 1) {
      if (!looksTruncatedReply(finalReply)) break;
      if (__DEV__) {
        console.warn('[GuruGrounded] Reply appears truncated, requesting continuation.', {
          attempt,
          maxAttempts: MAX_CONTINUATION_ATTEMPTS,
          chars: finalReply.length,
        });
      }
      const continuation = await generateTextWithRouting(
        buildContinuationMessages(msgs, finalReply),
        { chosenModel, providerOrderOverride: DEFAULT_PROVIDER_ORDER },
      );
      const continuationText = finalizeGuruReply(continuation.text, recentGuruQuestions);
      if (!hasUsefulContinuation(finalReply, continuationText)) break;
      const appended = appendContinuation(finalReply, continuationText);
      if (appended.length <= finalReply.length) break;
      finalReply = appended;
      modelUsed = continuation.modelUsed || modelUsed;
    }
    return {
      reply: finalReply,
      sources,
      modelUsed,
      searchQuery,
    };
  } catch (error: unknown) {
    throw mapGroundedChatError(error);
  }
}

export type GuruChatMemoryContext = {
  /** Rolling summary of earlier turns in this thread (SQLite). */
  sessionSummary?: string;
  /** Optional facts the student saved in Settings (exam goals, weak subjects, etc.). */
  profileNotes?: string;
  /** Bounded FSRS/review + exam countdown line from DB (see `buildBoundedGuruChatStudyContext`). */
  studyContext?: string;
  /** Syllabus `topics.id` when navigation provided it (disambiguation / grounding). */
  syllabusTopicId?: number;
  /** Optional local context from the user's own saved notes/transcripts. */
  groundingContext?: string;
  groundingTitle?: string;
};

/** Grounded Guru chat with SSE-style token deltas for cloud routes (local emits once at end). */
export async function chatWithGuruGroundedStreaming(
  question: string,
  topicName: string | undefined,
  history: Array<{ role: 'user' | 'guru'; text: string }>,
  chosenModel: string | undefined,
  onReplyDelta: (delta: string) => void,
  memoryContext?: GuruChatMemoryContext,
): Promise<import('./types').GroundedGuruResponse> {
  const trimmedQuestion = question.replace(/\s+/g, ' ').trim();
  const searchQuery = buildMedicalSearchQuery(trimmedQuestion, topicName);
  const imageSeed = buildImageSearchSeed(trimmedQuestion, topicName, history);
  const recentGuruQuestions = extractRecentGuruQuestions(history);

  // Parallel text + image search (fault-tolerant).
  // Image search helps future visual features, but should not pollute the citation/source panel.
  const [textResult, imageQueryResult] = await Promise.allSettled([
    searchLatestMedicalSources(searchQuery, 5),
    imageSeed
      ? generateImageSearchQuery(imageSeed.topic, imageSeed.context)
      : Promise.resolve(null),
  ]);
  const imageQuery =
    imageQueryResult.status === 'fulfilled' ? imageQueryResult.value?.trim() || null : null;
  const imageResult = imageQuery
    ? await Promise.allSettled([searchMedicalImages(imageQuery, 3)]).then(([result]) => result)
    : ({ status: 'fulfilled', value: [] } as PromiseFulfilledResult<MedicalGroundingSource[]>);
  const sources =
    textResult.status === 'fulfilled' ? dedupeGroundingSources(textResult.value).slice(0, 8) : [];
  const referenceImages =
    imageResult.status === 'fulfilled'
      ? dedupeGroundingSources(imageResult.value)
          .filter((image) => isRenderableReferenceImageUrl(image.imageUrl))
          .slice(0, 3)
      : [];

  logGroundingEvent('chat_reference_images', {
    question: previewText(trimmedQuestion, 120),
    topicName: topicName ?? '',
    imageQuery: imageQuery ? previewText(imageQuery, 140) : '',
    imageSearchStatus: imageResult.status,
    imageSearchSkipped: !imageSeed,
    imageSeedTopic: imageSeed?.topic ?? '',
    imageSeedContext: imageSeed?.context ? previewText(imageSeed.context, 180) : '',
    imageQueryGenerationStatus: imageQueryResult.status,
    imageCandidates: imageResult.status === 'fulfilled' ? imageResult.value.length : 0,
    usableReferenceImages: referenceImages.length,
    sampleReferenceTitles: referenceImages.slice(0, 3).map((image) => previewText(image.title, 80)),
    sampleReferenceUrls: referenceImages
      .slice(0, 3)
      .map((image) => previewText(image.imageUrl ?? image.url, 120)),
    imageSearchError:
      imageResult.status === 'rejected'
        ? imageResult.reason instanceof Error
          ? imageResult.reason.message
          : String(imageResult.reason)
        : undefined,
  });

  const sourcesBlock =
    sources.length > 0
      ? renderSourcesForPrompt(sources)
      : 'No live web sources were retrieved for this query.';

  const profileBlock =
    memoryContext?.profileNotes?.trim() &&
    `What you already know about this student (they saved this in Settings):\n${memoryContext.profileNotes.trim()}\n`;

  const sessionBlock =
    memoryContext?.sessionSummary?.trim() &&
    `Earlier thread summary (compressed — may omit details):\n${memoryContext.sessionSummary.trim()}\n`;

  const studyBlock =
    memoryContext?.studyContext?.trim() &&
    `Study snapshot from their progress DB (samples only):\n${memoryContext.studyContext.trim()}\n`;

  const localGroundingBlock =
    memoryContext?.groundingContext?.trim() &&
    `Student's saved notes context${memoryContext.groundingTitle ? ` (${memoryContext.groundingTitle})` : ''}:\n${clipText(
      memoryContext.groundingContext.trim(),
      5000,
    )}\n`;

  const systemPrompt = buildGuruSystemPrompt({ grounded: true });

  const topicContextLine = buildTopicContextLine(topicName, memoryContext?.syllabusTopicId);
  const userPrompt = `${topicContextLine ? `${topicContextLine}\n` : ''}${profileBlock ?? ''}${sessionBlock ?? ''}${studyBlock ?? ''}${localGroundingBlock ?? ''}
Student question: ${trimmedQuestion}
${recentGuruQuestions.length > 0 ? `\nRecent Guru questions already asked - do not repeat or paraphrase them:\n${recentGuruQuestions.map((q, i) => `${i + 1}. ${q}`).join('\n')}\n` : ''}
${sources.length > 0 ? `\nSUPPLEMENTARY REFERENCES (use only if relevant):\n${sourcesBlock}` : ''}
Respond using your medical knowledge. Reference the sources only if they are directly relevant.`;

  const msgs: Message[] = [
    { role: 'system', content: systemPrompt },
    ...buildHistoryMessages(history, 6),
    { role: 'user', content: userPrompt },
  ];

  try {
    let emittedReply = '';
    const safeEmitDelta = (delta: string) => {
      if (!delta) return;
      const nextSanitized = sanitizeSingleGuruTurn(`${emittedReply}${delta}`);
      if (nextSanitized.length <= emittedReply.length) return;
      const cleanDelta = nextSanitized.slice(emittedReply.length);
      emittedReply = nextSanitized;
      if (cleanDelta) onReplyDelta(cleanDelta);
    };

    const response = await generateTextWithRoutingStream(
      msgs,
      { chosenModel, providerOrderOverride: DEFAULT_PROVIDER_ORDER },
      safeEmitDelta,
    );
    let finalReply = finalizeGuruReply(response.text, recentGuruQuestions);
    if (finalReply.length > emittedReply.length) {
      const remaining = finalReply.slice(emittedReply.length);
      if (remaining) {
        onReplyDelta(remaining);
        emittedReply = finalReply;
      }
    }
    let modelUsed = response.modelUsed;
    for (let attempt = 1; attempt <= MAX_CONTINUATION_ATTEMPTS; attempt += 1) {
      if (!looksTruncatedReply(finalReply)) break;
      if (__DEV__) {
        console.warn('[GuruGrounded] Stream reply appears truncated, requesting continuation.', {
          attempt,
          maxAttempts: MAX_CONTINUATION_ATTEMPTS,
          chars: finalReply.length,
        });
      }
      const continuation = await generateTextWithRoutingStream(
        buildContinuationMessages(msgs, finalReply),
        { chosenModel, providerOrderOverride: DEFAULT_PROVIDER_ORDER },
        safeEmitDelta,
      );
      const continuationText = finalizeGuruReply(continuation.text, recentGuruQuestions);
      if (!hasUsefulContinuation(finalReply, continuationText)) break;
      const appended = appendContinuation(finalReply, continuationText);
      if (appended.length <= finalReply.length) break;
      finalReply = appended;
      if (finalReply.length > emittedReply.length) {
        const remaining = finalReply.slice(emittedReply.length);
        if (remaining) {
          onReplyDelta(remaining);
          emittedReply = finalReply;
        }
      }
      modelUsed = continuation.modelUsed || modelUsed;
    }
    return {
      reply: finalReply,
      sources,
      referenceImages,
      modelUsed,
      searchQuery,
    };
  } catch (error: unknown) {
    throw mapGroundedChatError(error);
  }
}

export async function askGuru(question: string, context: string): Promise<string> {
  const schema = z.object({ feedback: z.string(), score: z.number(), missed: z.array(z.string()) });
  const messages: Message[] = [
    {
      role: 'system',
      content: `${SYSTEM_PROMPT}
Respond as Guru evaluating a student's answer.
Output JSON only: { "feedback": "...", "score": 0-5, "missed": ["key point missed"] }

Formatting rules:
- Write "feedback" as concise markdown-friendly teaching text.
- Use markdown bolding (**term**) only for the 3 or 4 most important medical terms, mechanisms, or mistakes.
- Keep normal text plain.
- "missed" items may also include brief markdown bolding for the core term.`,
    },
    { role: 'user', content: `Context: ${context}\n\nStudent answer: ${question}` },
  ];
  const { parsed } = await generateJSONWithRouting(
    messages,
    schema,
    'low',
    true,
    undefined,
    DEFAULT_PROVIDER_ORDER,
  );
  return JSON.stringify(parsed);
}

/**
 * Generate a structured deeper explanation for a quiz question.
 * Returns plain markdown text (not JSON) suitable for direct rendering.
 */
export async function explainTopicDeeper(
  topicName: string,
  question: string,
  correctAnswer: string,
  originalExplanation: string,
): Promise<string> {
  const messages: Message[] = [
    {
      role: 'system',
      content: `You are Guru, a warm medical tutor for NEET-PG/INICET students. Explain concepts clearly using markdown formatting. Follow these output constraints exactly:
${GURU_ADHD_FORMATTING_RULES}
Never use raw escape characters like \\n in your output.`,
    },
    {
      role: 'user',
      content: `The student doesn't understand a quiz question about "${topicName}". Help them understand the broader concept.

**Question:** ${question}
**Correct answer:** ${correctAnswer}
**Original explanation:** ${originalExplanation}

Explain using this structure:
1. **What is the core concept?** (1-2 short sentences)

2. **Why is "${correctAnswer}" correct?** (1-2 short sentences)

3. **Key facts to remember**
- Keep each bullet short

4. **Clinical/exam tip** (one short practical takeaway)

Only bold the most important 3 or 4 terms in the whole answer.`,
    },
  ];
  const { text } = await generateTextWithRouting(messages, {
    providerOrderOverride: DEFAULT_PROVIDER_ORDER,
  });
  return text.trim();
}
