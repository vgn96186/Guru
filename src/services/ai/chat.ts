import { z } from 'zod';
import { SYSTEM_PROMPT } from '../../constants/prompts';
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
  generateVisualSearchQueries,
  dedupeGroundingSources,
  renderSourcesForPrompt,
  clipText,
  buildMedicalSearchQuery,
} from './medicalSearch';
import { logGroundingEvent, previewText } from './runtimeDebug';
import { parseGuruTutorState, type GuruTutorIntent } from '../guruChatSessionSummary';

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
    '7) Never assume prerequisite knowledge. When you use a technical term, define it in plain words the first time.',
    '8) Use a foundation-first ladder: Basics -> Mechanism -> Exam-relevant takeaway -> one checkpoint.',
    '9) If STUDY CONTEXT suggests low confidence or weak basics, simplify aggressively and teach prerequisite concepts before advanced details.',
    '10) If STUDENT INTENT says the learner wants direct teaching, explanation of an error, or a comparison, answer directly first. Do not stay Socratic by default.',
    '11) If TUTOR STATE gives an open doubt or next micro-goal, resolve that before drifting into a new subtopic. Every turn should either close one doubt, advance one micro-goal, or briefly park a tangent and return.',
    options.grounded
      ? '12) Do not use citations inline - keep it natural, not academic.'
      : options.includeStudyContext
        ? '12) Use the STUDY CONTEXT when it is provided so your answer matches the exact card, question, or explanation the student is viewing.'
        : '12) Never output JSON.',
    options.grounded
      ? '13) NEVER refuse to answer a medical question. Always provide your best knowledge even if sources are unavailable or irrelevant.'
      : options.includeStudyContext
        ? '13) Never output JSON.'
        : "13) Output only Guru's next single turn. Never write Student:/User:/Guru: role labels and never invent the student's reply.",
    options.grounded || options.includeStudyContext
      ? "14) Output only Guru's next single turn. Never write Student:/User:/Guru: role labels and never invent the student's reply."
      : '14) If you ask a question, that question must be the final line in your reply. Never answer your own question.',
    options.grounded || options.includeStudyContext
      ? '15) Never ask the same or nearly the same question again if it was already asked in recent turns or blocked by TUTOR STATE. Build on the conversation state instead.'
      : null,
    options.grounded || options.includeStudyContext
      ? '16) If the student has already failed or declined to answer a point, do not quiz them on that same point again in the next turn. Teach it and move on.'
      : null,
    options.grounded || options.includeStudyContext
      ? '17) If the student raises a side question that is not central, answer it briefly, park it, and return to the main micro-goal unless they explicitly want to switch topics.'
      : '15) Follow these output constraints exactly:',
    options.grounded || options.includeStudyContext
      ? '18) If you ask a question, that question must be the final line in your reply. Never answer your own question.'
      : null,
    options.grounded || options.includeStudyContext
      ? '19) Follow these output constraints exactly:'
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
  // Filter out directional-only or yes/no questions
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
  // Only filter out very short single-word acknowledgments
  if (tokens.length === 1 && ['ok', 'okay', 'thanks', 'thank'].includes(normalized)) {
    return true;
  }
  return false;
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
        ? `Topic: ${topicName.trim()}\nTutor context: ${clipText(
            recentGuruReply,
            260,
          )}\nLatest student message: ${clipText(trimmedQuestion, 160)}`
        : `Topic: ${topicName.trim()}\nLatest student message: ${clipText(trimmedQuestion, 160)}`,
    };
  }

  // Fallback: use the question itself if it's substantive
  if (trimmedQuestion.length >= 6) {
    return {
      topic: trimmedQuestion.slice(0, 120),
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

function buildConceptKey(text: string): string {
  return extractKeyTerms(text).slice(0, 5).join('_');
}

function conceptOverlap(a: string, b: string): boolean {
  const aTerms = extractKeyTerms(a);
  const bTerms = extractKeyTerms(b);
  if (aTerms.length === 0 || bTerms.length === 0) return false;
  const bSet = new Set(bTerms);
  const overlapCount = aTerms.filter((term) => bSet.has(term)).length;
  const minLen = Math.min(aTerms.length, bTerms.length);
  return (
    overlapCount >= Math.min(2, minLen) ||
    overlapCount / Math.max(aTerms.length, bTerms.length) >= 0.6
  );
}

function dedupeConcepts(values: Array<string | null | undefined>): string[] {
  const items: string[] = [];
  for (const value of values) {
    const trimmed = (value ?? '').trim();
    if (!trimmed) continue;
    if (items.some((existing) => conceptOverlap(existing, trimmed))) continue;
    items.push(trimmed);
  }
  return items;
}

function detectStudentIntent(question: string): GuruTutorIntent {
  const normalized = question.trim().toLowerCase();
  if (!normalized) return 'clarify_doubt';
  if (/(compare|difference between|differentiate|vs\b|versus)/i.test(normalized)) return 'compare';
  if (/(quiz me|test me|ask me|mcq|question me)/i.test(normalized)) return 'quiz_me';
  if (/(wrong|why .*wrong|mistake|explanation for this answer)/i.test(normalized))
    return 'explain_wrong_answer';
  if (/(recap|summari[sz]e|short summary|revise quickly)/i.test(normalized)) return 'recap';
  if (
    /(just tell me|just explain|directly|straight answer|explain it|teach me|i don't know|dont know|do not know|no idea)/i.test(
      normalized,
    )
  )
    return 'direct_teach';
  if (/(another thing|also|side note|by the way|unrelated)/i.test(normalized)) return 'tangent';
  if (/(next|move on|continue|go ahead)/i.test(normalized)) return 'advance';
  return 'clarify_doubt';
}

function buildIntentInstruction(intent: GuruTutorIntent): string {
  switch (intent) {
    case 'direct_teach':
      return 'Student intent: direct_teach. Give a direct explanation first. Do not ask a discovery question until the core doubt is resolved.';
    case 'explain_wrong_answer':
      return 'Student intent: explain_wrong_answer. Explain exactly why the mistake happened, contrast the correct concept, and avoid vague motivational talk.';
    case 'compare':
      return 'Student intent: compare. Contrast the two entities cleanly using the highest-yield differences before any checkpoint.';
    case 'quiz_me':
      return 'Student intent: quiz_me. You may ask one checkpoint, but it must advance to a new concept rather than repeat the last failed one.';
    case 'recap':
      return 'Student intent: recap. Compress the concept into a clean recap, then stop or ask one very short next-step question only if useful.';
    case 'tangent':
      return 'Student intent: tangent. Answer briefly, park the tangent if needed, and return to the main topic unless the student clearly asks to switch.';
    case 'advance':
      return 'Student intent: advance. Continue from the next micro-goal instead of revisiting the same checkpoint.';
    default:
      return 'Student intent: clarify_doubt. Resolve the exact confusion in plain language before adding a checkpoint.';
  }
}

function renderTutorStateForPrompt(
  stateJson: string | null | undefined,
  topicName: string | undefined,
): { stateBlock?: string; blockedConcepts: string[] } {
  const topic = topicName?.trim() || 'General Medicine';
  const state = parseGuruTutorState(stateJson, topic);
  const blockedConcepts = dedupeConcepts([
    ...state.questionConceptsAlreadyAsked,
    ...state.avoidReaskingConcepts,
  ]);

  const lines = [
    `Tutor state topic focus: ${state.currentTopicFocus || topic}`,
    state.currentSubtopic ? `Current subtopic: ${state.currentSubtopic}` : null,
    `Active mode: ${state.activeMode}`,
    `Last student intent: ${state.lastStudentIntent}`,
    state.openDoubts.length > 0 ? `Open doubts: ${state.openDoubts.join(' | ')}` : null,
    state.resolvedDoubts.length > 0 ? `Resolved doubts: ${state.resolvedDoubts.join(' | ')}` : null,
    state.misconceptions.length > 0
      ? `Known misconceptions: ${state.misconceptions.join(' | ')}`
      : null,
    state.prerequisitesExplained.length > 0
      ? `Prerequisites already explained: ${state.prerequisitesExplained.join(' | ')}`
      : null,
    state.factsConfirmed.length > 0
      ? `Facts already confirmed: ${state.factsConfirmed.join(' | ')}`
      : null,
    blockedConcepts.length > 0
      ? `Do not immediately re-ask these concepts: ${blockedConcepts.join(' | ')}`
      : null,
    state.nextMicroGoal ? `Next micro-goal: ${state.nextMicroGoal}` : null,
    state.tangentParkingLot.length > 0
      ? `Tangent parking lot: ${state.tangentParkingLot.join(' | ')}`
      : null,
  ].filter(Boolean);

  return {
    stateBlock: lines.length > 0 ? `Structured tutoring state:\n${lines.join('\n')}\n` : undefined,
    blockedConcepts,
  };
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

type FinalizeGuruOptions = {
  recentQuestions?: string[];
  studentIntent?: GuruTutorIntent;
  blockedConcepts?: string[];
  studentQuestion?: string;
};

function normalizeFinalizeGuruOptions(
  options: string[] | FinalizeGuruOptions | undefined,
): FinalizeGuruOptions {
  if (Array.isArray(options)) {
    return { recentQuestions: options };
  }
  return options ?? {};
}

function shouldDropIntentQuestion(
  body: string,
  finalQuestion: string,
  options: FinalizeGuruOptions,
): boolean {
  const { studentIntent, blockedConcepts = [], studentQuestion } = options;
  if (!studentIntent) return false;

  const isDirectHelpIntent = [
    'clarify_doubt',
    'direct_teach',
    'compare',
    'explain_wrong_answer',
    'recap',
  ].includes(studentIntent);
  if (!isDirectHelpIntent) return false;

  const finalConcept = buildConceptKey(finalQuestion);
  const studentConcept = buildConceptKey(studentQuestion ?? '');
  if (!finalConcept) return false;

  if (studentConcept && conceptOverlap(finalConcept, studentConcept)) {
    return true;
  }

  if (conceptOverlap(finalQuestion, body)) {
    return true;
  }

  const bodyTerms = extractKeyTerms(body);
  const finalQuestionTerms = extractKeyTerms(finalQuestion);
  const sharedBodyTerms = finalQuestionTerms.filter((term) => bodyTerms.includes(term)).length;
  const bodyLooksExplanatory =
    /\b(because|due to|means|refers to|causes|happens when|so that)\b/i.test(body);
  if (sharedBodyTerms >= 1 && bodyLooksExplanatory) {
    return true;
  }

  return blockedConcepts.some((concept) => conceptOverlap(concept, finalQuestion));
}

function finalizeGuruReply(reply: string, options: string[] | FinalizeGuruOptions = []): string {
  const normalizedOptions = normalizeFinalizeGuruOptions(options);
  const recentQuestions = normalizedOptions.recentQuestions ?? [];
  const sanitized = sanitizeSingleGuruTurn(reply);
  if (!sanitized) return sanitized;
  const { body, question } = splitReplyAndFinalQuestion(sanitized);
  if (!question) return sanitized;
  if (shouldDropIntentQuestion(body, question, normalizedOptions)) {
    return body.trim();
  }
  if (!shouldDropFinalQuestion(sanitized, recentQuestions)) return sanitized;
  return body.trim();
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
  const studentIntent = detectStudentIntent(question);
  const contextPrompt = `Topic: ${topicName}${
    studyContext ? `\n\nStudy context:\n${studyContext}` : ''
  }\n\n${buildIntentInstruction(studentIntent)}\nInstruction: Prioritize exam-relevant high-yield concepts, but first repair foundational gaps. If prerequisite concepts are missing, explain those first in plain language.`;
  const systemPrompt = buildGuruSystemPrompt({ includeStudyContext: true });
  const { text } = await generateTextWithRouting(
    [
      { role: 'system', content: systemPrompt },
      { role: 'system', content: contextPrompt },
      ...buildHistoryMessages(history, 4),
      { role: 'user', content: question },
    ],
    { chosenModel },
  );
  return {
    reply: finalizeGuruReply(text, {
      recentQuestions: recentGuruQuestions,
      studentIntent,
      studentQuestion: question,
    }),
  };
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
  const userPrompt = `${
    topicContextLine ? `${topicContextLine}\n` : ''
  }Student question: ${trimmedQuestion}
${
  recentGuruQuestions.length > 0
    ? `\nRecent Guru questions already asked - do not repeat or paraphrase them:\n${recentGuruQuestions
        .map((q, i) => `${i + 1}. ${q}`)
        .join('\n')}\n`
    : ''
}
${sources.length > 0 ? `\nSUPPLEMENTARY REFERENCES (use only if relevant):\n${sourcesBlock}` : ''}
Respond using your medical knowledge. Reference the sources only if they are directly relevant.
If the student may not know prerequisites, explain prerequisite basics first and define jargon briefly.`;

  const msgs: Message[] = [
    { role: 'system', content: systemPrompt },
    ...buildHistoryMessages(history, 6),
    { role: 'user', content: userPrompt },
  ];

  try {
    const response = await generateTextWithRouting(msgs, {
      chosenModel,
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
        { chosenModel },
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
  /** Structured tutoring state carried across turns (SQLite). */
  stateJson?: string;
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
  const studentIntent = detectStudentIntent(trimmedQuestion);
  const { stateBlock, blockedConcepts } = renderTutorStateForPrompt(
    memoryContext?.stateJson,
    topicName,
  );
  const recentConcepts = recentGuruQuestions
    .map((questionText) => buildConceptKey(questionText))
    .filter(Boolean);
  const allBlockedConcepts = dedupeConcepts([...blockedConcepts, ...recentConcepts]);

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

  // If single query returned no results, try smart visual queries
  const initialImages = imageResult.status === 'fulfilled' ? imageResult.value : [];
  let finalImageResult = imageResult;
  if (initialImages.length === 0 && imageSeed) {
    const visualQueries = await generateVisualSearchQueries(imageSeed.topic);
    const smartResults = await Promise.allSettled(
      visualQueries.map((vq) => searchMedicalImages(vq, 2)),
    );
    const smartImages = dedupeGroundingSources(
      smartResults
        .filter(
          (r): r is PromiseFulfilledResult<MedicalGroundingSource[]> => r.status === 'fulfilled',
        )
        .flatMap((r) => r.value),
    );
    if (smartImages.length > 0) {
      finalImageResult = { status: 'fulfilled', value: smartImages };
    }
  }

  const sources =
    textResult.status === 'fulfilled' ? dedupeGroundingSources(textResult.value).slice(0, 8) : [];
  const referenceImages =
    finalImageResult.status === 'fulfilled'
      ? dedupeGroundingSources(finalImageResult.value)
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

  // Image search status is already logged via logGroundingEvent above.

  const sourcesBlock =
    sources.length > 0
      ? renderSourcesForPrompt(sources)
      : 'No live web sources were retrieved for this query.';

  // Add reference images to the LLM prompt so it knows images are available
  const imagesBlock =
    referenceImages.length > 0
      ? `Reference images found (these are available to the student):\n${referenceImages
          .slice(0, 3)
          .map(
            (img, i) =>
              `[Image ${i + 1}] ${img.title}\nURL: ${img.imageUrl}\nSource: ${img.source}${img.snippet ? `\nContext: ${img.snippet}` : ''}`,
          )
          .join(
            '\n\n',
          )}\nYou can reference these images in your reply (e.g., "see image 1 above"). Do NOT say you cannot show images — the system displays them inline below your reply.`
      : '';

  const profileBlock =
    memoryContext?.profileNotes?.trim() &&
    `What you already know about this student (they saved this in Settings):\n${memoryContext.profileNotes.trim()}\n`;

  const sessionBlock =
    memoryContext?.sessionSummary?.trim() &&
    `Earlier thread summary (compressed — may omit details):\n${memoryContext.sessionSummary.trim()}\n`;

  const tutorStateBlock = stateBlock;

  const studyBlock =
    memoryContext?.studyContext?.trim() &&
    `Study snapshot from their progress DB (samples only):\n${memoryContext.studyContext.trim()}\n`;

  const localGroundingBlock =
    memoryContext?.groundingContext?.trim() &&
    `Student's saved notes context${
      memoryContext.groundingTitle ? ` (${memoryContext.groundingTitle})` : ''
    }:\n${clipText(memoryContext.groundingContext.trim(), 5000)}\n`;

  const systemPrompt = buildGuruSystemPrompt({ grounded: true });

  const topicContextLine = buildTopicContextLine(topicName, memoryContext?.syllabusTopicId);
  const userPrompt = `${topicContextLine ? `${topicContextLine}\n` : ''}${profileBlock ?? ''}${
    sessionBlock ?? ''
  }${tutorStateBlock ?? ''}${studyBlock ?? ''}${localGroundingBlock ?? ''}
${buildIntentInstruction(studentIntent)}
Student question: ${trimmedQuestion}
${
  recentGuruQuestions.length > 0
    ? `\nRecent Guru questions already asked - do not repeat or paraphrase them:\n${recentGuruQuestions
        .map((q, i) => `${i + 1}. ${q}`)
        .join('\n')}\n`
    : ''
}
${
  allBlockedConcepts.length > 0
    ? `\nConcepts blocked from immediate re-questioning:\n${allBlockedConcepts
        .map((concept, i) => `${i + 1}. ${concept}`)
        .join('\n')}\n`
    : ''
}
${sources.length > 0 ? `\nSUPPLEMENTARY REFERENCES (use only if relevant):\n${sourcesBlock}` : ''}
${imagesBlock ? `\n${imagesBlock}` : ''}
Respond using your medical knowledge. Reference the sources only if they are directly relevant.
If the student may not know prerequisites, explain prerequisite basics first and define jargon briefly.`;

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
    let finalReply = finalizeGuruReply(response.text, {
      recentQuestions: recentGuruQuestions,
      studentIntent,
      blockedConcepts: allBlockedConcepts,
      studentQuestion: trimmedQuestion,
    });
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
      const continuationText = finalizeGuruReply(continuation.text, {
        recentQuestions: recentGuruQuestions,
        studentIntent,
        blockedConcepts: allBlockedConcepts,
        studentQuestion: trimmedQuestion,
      });
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
    undefined,
  );
  return JSON.stringify(parsed);
}

export async function explainMostTestedRationale(
  point: string,
  topicName: string,
): Promise<string> {
  const messages: Message[] = [
    {
      role: 'system',
      content: `You are Guru, a warm NEET-PG/INICET medical tutor.
Explain why a point is "most tested/high-yield" for exams.
Follow these output constraints exactly:
${GURU_ADHD_FORMATTING_RULES}
Never output JSON.`,
    },
    {
      role: 'user',
      content: `Topic: ${topicName}
Point: ${point}

Write 2-3 concise sentences that explain WHY this is high-yield.
You MUST include all three:
1) Clinical prevalence/common exam frequency
2) Management shift or treatment implication (e.g., surgery vs radiotherapy/chemoradiation when relevant)
3) Prognostic significance versus earlier/less severe disease

If one dimension is not applicable, state that briefly but still cover the other two.
Do not just restate the definition.`,
    },
  ];
  const { text } = await generateTextWithRouting(messages, {});
  return text.trim();
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
      content: `The student doesn’t understand a quiz question about “${topicName}”. Your TOP priority is to teach the broader underlying concept the question is testing (not just justify the correct option).

**Question:** ${question}
**Correct answer:** ${correctAnswer}
**Original explanation:** ${originalExplanation}

Write the answer using this structure (use real facts, no placeholders). Spend MOST of your words on (1) and (2):

1) **Broader topic in plain language** (2-4 short bullets)
- Define the concept + the clinical frame (what it is, where it applies).
- Include the 2-3 highest-yield facts that let someone solve *new* variants of the question.

2) **Mental model / how to reason** (2-4 short bullets)
- “If you see X → think Y → choose Z” style rules.
- Mention the single most common exam trap.

3) **If this is about a classification/staging system** (FIGO/TNM/staging/grades):
- You MUST explicitly list the relevant stages/grades in compact bullets (no tables).
- Example format (adapt to the exact system being asked):
  - **Stage I**: ...
  - **Stage II**: ...
  - **Stage III**: ...
  - **Stage IV**: ...

4) **Why the correct answer is correct** (2-4 short bullets)

5) **Common traps / how exams twist it** (2-4 short bullets)

6) **Treatment / management implication** (1-3 short bullets, only what’s exam-relevant)

7) **Key Takeaways** (exactly 3 bullet points)
- The single most important fact an examiner wants you to know.
- The most common wrong answer and why students choose it.
- One sentence connecting pathophysiology → presentation → management.

8) **Check your understanding** (one line — a simple question the student should be able to answer now)
Format exactly as: “Quick check: [question]? ||[answer]||”
The answer goes between || markers so it can be revealed on tap.

Constraints:
- No tables.
- Keep it under ~400 words.
- Bold only the most important 4-6 terms total.`,
    },
  ];
  const { text } = await generateTextWithRouting(messages, {});
  return text.trim();
}

/**
 * Explain a specific medical concept, sign, or lab value mentioned in a quiz question.
 * Returns 2-3 short markdown bullet points — ideal for inline tap-to-expand explanations.
 */
export async function explainQuizConcept(
  concept: string,
  topicContext: string,
): Promise<string> {
  const messages: Message[] = [
    {
      role: 'system',
      content: `You are Guru, a concise NEET-PG medical tutor. Give sharp, exam-focused facts only.
Use markdown bolding for key values and terms. No tables. No intro/outro phrases.`,
    },
    {
      role: 'user',
      content: `Explain "${concept}" in the context of "${topicContext}" for a NEET-PG student in exactly 2-3 short bullet points.
Cover:
- What it is / normal range or definition
- Clinical significance / when it is abnormal
- Exam-relevant implication or most-tested fact

Keep it under 60 words total. Bold only the 1-2 most testable values or terms.`,
    },
  ];
  const { text } = await generateTextWithRouting(messages, {});
  return text.trim();
}
