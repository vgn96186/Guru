import { z } from 'zod';
import { SYSTEM_PROMPT } from '../../constants/prompts';
import type { Message } from './types';
import {
  generateJSONWithRouting,
  generateTextWithRouting,
  generateTextWithRoutingStream,
} from './generate';
import {
  searchLatestMedicalSources,
  searchMedicalImages,
  dedupeGroundingSources,
  renderSourcesForPrompt,
  clipText,
  buildMedicalSearchQuery,
} from './medicalSearch';

const MAX_CONTINUATION_ATTEMPTS = 2;

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

function truncateAfterAskedQuestion(text: string): string {
  const firstQuestionIndex = text.indexOf('?');
  if (firstQuestionIndex === -1) return text;
  const trailing = text.slice(firstQuestionIndex + 1).trim();
  if (!trailing) return text;

  const hasAnotherQuestion = trailing.includes('?');
  const startsLikeContinuationAnswer =
    /^[A-Z0-9*_(["']/.test(trailing) || /^(the|it|they|this|that|these|those|because|so|therefore|plasma|interstitial|answer)\b/i.test(trailing);

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
  const contextPrompt = `Topic: ${topicName}${
    studyContext ? `\n\nStudy context:\n${studyContext}` : ''
  }`;
  const systemPrompt = `You are Guru, a Socratic medical tutor for NEET-PG/INICET. Guide the student to discover answers — never lecture.
Rules:
1. Ask ONE focused clinical question per response. No information dumps.
2. If the student answers, react in one sentence (affirm or gently correct), then ask the next logical question.
3. Focus only on high-yield exam facts — ignore rare minutiae.
4. Max 3 sentences per response. Be warm and conversational.
5. Wrap key clinical terms in **bold**.
6. If the student says "just tell me" or "explain it", give a brief 2-sentence summary then ask a follow-up.
7. Use the STUDY CONTEXT when it is provided so your answer matches the exact card, question, or explanation the student is viewing.
8. Never output JSON.
9. Output only Guru's next single turn. Never write Student:/User:/Guru: role labels and never invent the student's reply.
10. If you ask a question, that question must be the final sentence in your reply. Never answer your own question.`;
  const { text } = await generateTextWithRouting(
    [
      { role: 'system', content: systemPrompt },
      { role: 'system', content: contextPrompt },
      ...buildHistoryMessages(history, 4),
      { role: 'user', content: question },
    ],
    { chosenModel },
  );
  return { reply: sanitizeSingleGuruTurn(text) };
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

  const sourcesBlock =
    sources.length > 0
      ? renderSourcesForPrompt(sources)
      : 'No live web sources were retrieved for this query.';

  const systemPrompt = `You are Guru, a Socratic medical tutor for NEET-PG/INICET. Guide the student to discover answers — never lecture.
Rules:
1) Ask ONE focused clinical question per response. No information dumps.
2) If the student answers, react in one sentence (affirm or correct briefly), then ask the next logical question.
3) Use your medical knowledge as the PRIMARY basis for answers. Sources below are supplementary references only — ignore irrelevant ones.
4) Max 3 sentences per response. Be warm and conversational.
5) Wrap key clinical terms in **bold**.
6) If the student says "just tell me" or "explain it", give a 2-sentence summary then follow up with a question.
7) Do not use citations inline - keep it natural, not academic.
8) NEVER refuse to answer a medical question. Always provide your best knowledge even if sources are unavailable or irrelevant.
9) Output only Guru's next single turn. Never write Student:/User:/Guru: role labels and never invent the student's reply.
10) If you ask a question, that question must be the final sentence in your reply. Never answer your own question.`;

  const userPrompt = `Topic context: ${topicName || 'General Medicine'}
Student question: ${trimmedQuestion}
${sources.length > 0 ? `\nSUPPLEMENTARY REFERENCES (use only if relevant):\n${sourcesBlock}` : ''}
Respond using your medical knowledge. Reference the sources only if they are directly relevant.`;

  const msgs: Message[] = [
    { role: 'system', content: systemPrompt },
    ...buildHistoryMessages(history, 6),
    { role: 'user', content: userPrompt },
  ];

  try {
    const response = await generateTextWithRouting(msgs, { chosenModel });
    let finalReply = sanitizeSingleGuruTurn(response.text);
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
        { chosenModel },
      );
      const continuationText = sanitizeSingleGuruTurn(continuation.text);
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

  // Image search uses a clean query (no SEO suffixes that pollute Wikimedia/Open i)
  const imageQuery = trimmedQuestion.slice(0, 120);

  // Parallel text + image search (fault-tolerant)
  const [textResult, imageResult] = await Promise.allSettled([
    searchLatestMedicalSources(searchQuery, 5),
    searchMedicalImages(topicName ? `${topicName} ${imageQuery}` : imageQuery, 3),
  ]);
  const allSources: import('./types').MedicalGroundingSource[] = [];
  if (textResult.status === 'fulfilled') allSources.push(...textResult.value);
  if (imageResult.status === 'fulfilled') allSources.push(...imageResult.value);
  const sources = dedupeGroundingSources(allSources).slice(0, 8);

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

  const systemPrompt = `You are Guru, a Socratic medical tutor for NEET-PG/INICET. Guide the student to discover answers — never lecture.
Rules:
1) Ask ONE focused clinical question per response. No information dumps.
2) If the student answers, react in one sentence (affirm or correct briefly), then ask the next logical question.
3) Use your medical knowledge as the PRIMARY basis for answers. Sources below are supplementary references only — ignore irrelevant ones.
4) Max 3 sentences per response. Be warm and conversational.
5) Wrap key clinical terms in **bold**.
6) If the student says "just tell me" or "explain it", give a 2-sentence summary then follow up with a question.
7) Do not use citations inline - keep it natural, not academic.
8) NEVER refuse to answer a medical question. Always provide your best knowledge even if sources are unavailable or irrelevant.
9) Output only Guru's next single turn. Never write Student:/User:/Guru: role labels and never invent the student's reply.
10) If you ask a question, that question must be the final sentence in your reply. Never answer your own question.`;

  const topicLabel =
    (topicName || 'General Medicine') +
    (memoryContext?.syllabusTopicId != null
      ? ` (syllabus topic id ${memoryContext.syllabusTopicId})`
      : '');
  const userPrompt = `Topic context: ${topicLabel}
${profileBlock ?? ''}${sessionBlock ?? ''}${studyBlock ?? ''}
Student question: ${trimmedQuestion}
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

    const response = await generateTextWithRoutingStream(msgs, { chosenModel }, safeEmitDelta);
    let finalReply = sanitizeSingleGuruTurn(response.text);
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
        { chosenModel },
        safeEmitDelta,
      );
      const continuationText = sanitizeSingleGuruTurn(continuation.text);
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
      content: `${SYSTEM_PROMPT}\nRespond as Guru evaluating a student's answer. Output JSON: { "feedback": "...", "score": 0-5, "missed": ["key point missed"] }`,
    },
    { role: 'user', content: `Context: ${context}\n\nStudent answer: ${question}` },
  ];
  const { parsed } = await generateJSONWithRouting(messages, schema, 'low');
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
      content: `You are Guru, a warm Socratic medical tutor for NEET-PG/INICET students. Explain concepts clearly using markdown formatting. Use **bold** for key terms, bullet points for lists, and keep it structured and readable. Never use raw escape characters like \\n in your output.`,
    },
    {
      role: 'user',
      content: `The student doesn't understand a quiz question about "${topicName}". Help them understand the broader concept.

**Question:** ${question}
**Correct answer:** ${correctAnswer}
**Original explanation:** ${originalExplanation}

Explain using this structure:
1. **What is the core concept?** (1-2 sentences)
2. **Why is "${correctAnswer}" correct?** (explain the reasoning)
3. **Key facts to remember:**
   - Bullet point each fact
4. **Clinical/exam tip** (one practical takeaway)`,
    },
  ];
  const { text } = await generateTextWithRouting(messages);
  return text.trim();
}
