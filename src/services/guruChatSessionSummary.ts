import { z } from 'zod';
import { getChatHistory, getChatMessageCount } from '../db/queries/aiCache';
import { getSessionMemoryRow, upsertSessionMemory } from '../db/queries/guruChatMemory';
import { profileRepository } from '../db/repositories/profileRepository';
import { createGuruFallbackModel } from './ai/v2/providers/guruFallback';
import { generateObject } from './ai/v2/generateObject';
import { ProviderId } from '../types';
import type { ModelMessage } from './ai/v2/spec';

/** Regenerate rolling summary after this many new chat_history rows since last summary. */
export const GURU_SESSION_SUMMARY_INTERVAL = 8;

export const GURU_TUTOR_STATE_VERSION = 1;

const GURU_TUTOR_ACTIVE_MODES = [
  'diagnose',
  'explain',
  'checkpoint',
  'advance',
  'recap',
  'compare',
  'tangent_parked',
] as const;

const GURU_TUTOR_INTENTS = [
  'clarify_doubt',
  'direct_teach',
  'quiz_me',
  'compare',
  'explain_wrong_answer',
  'recap',
  'tangent',
  'advance',
] as const;

export type GuruTutorActiveMode = (typeof GURU_TUTOR_ACTIVE_MODES)[number];
export type GuruTutorIntent = (typeof GURU_TUTOR_INTENTS)[number];

export interface GuruTutorState {
  version: number;
  currentTopicFocus: string;
  currentSubtopic: string;
  activeMode: GuruTutorActiveMode;
  lastStudentIntent: GuruTutorIntent;
  openDoubts: string[];
  resolvedDoubts: string[];
  misconceptions: string[];
  prerequisitesExplained: string[];
  factsConfirmed: string[];
  questionConceptsAlreadyAsked: string[];
  avoidReaskingConcepts: string[];
  nextMicroGoal: string;
  tangentParkingLot: string[];
}

const TutorStateSchema = z.object({
  version: z.number().int().default(GURU_TUTOR_STATE_VERSION),
  currentTopicFocus: z.string().default(''),
  currentSubtopic: z.string().default(''),
  activeMode: z.enum(GURU_TUTOR_ACTIVE_MODES).default('diagnose'),
  lastStudentIntent: z.enum(GURU_TUTOR_INTENTS).default('clarify_doubt'),
  openDoubts: z.array(z.string()).max(6).default([]),
  resolvedDoubts: z.array(z.string()).max(6).default([]),
  misconceptions: z.array(z.string()).max(6).default([]),
  prerequisitesExplained: z.array(z.string()).max(6).default([]),
  factsConfirmed: z.array(z.string()).max(6).default([]),
  questionConceptsAlreadyAsked: z.array(z.string()).max(8).default([]),
  avoidReaskingConcepts: z.array(z.string()).max(8).default([]),
  nextMicroGoal: z.string().default(''),
  tangentParkingLot: z.array(z.string()).max(5).default([]),
});

/** Known keys that belong inside the `state` object. */
const STATE_KEYS = new Set<string>(TutorStateSchema.keyof().options);

/**
 * Some models (e.g. Qwen) return all state fields flat at the top level instead
 * of nested under a `state` key. This preprocessor normalises both shapes into
 * the canonical `{ summaryBullets, state: { … } }` form.
 */
const SummaryPayloadSchema = z.preprocess(
  (raw) => {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return raw;
    const obj = raw as Record<string, unknown>;

    // Ensure summaryBullets is an array
    if (!Array.isArray(obj.summaryBullets)) {
      obj.summaryBullets = [];
    }

    // Normalize activeMode
    if (obj.state && typeof obj.state === 'object' && !Array.isArray(obj.state)) {
      const stateObj = obj.state as Record<string, unknown>;
      if (
        typeof stateObj.activeMode === 'string' &&
        !GURU_TUTOR_ACTIVE_MODES.includes(stateObj.activeMode as any)
      ) {
        stateObj.activeMode = 'recap';
      }
      if (
        typeof stateObj.lastStudentIntent === 'string' &&
        !GURU_TUTOR_INTENTS.includes(stateObj.lastStudentIntent as any)
      ) {
        stateObj.lastStudentIntent = 'recap';
      }
    }

    if (obj.state !== undefined) return obj; // already nested — pass through

    const state: Record<string, unknown> = {};
    const rest: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (STATE_KEYS.has(k)) {
        if (
          k === 'activeMode' &&
          typeof v === 'string' &&
          !GURU_TUTOR_ACTIVE_MODES.includes(v as any)
        ) {
          state[k] = 'recap';
        } else if (
          k === 'lastStudentIntent' &&
          typeof v === 'string' &&
          !GURU_TUTOR_INTENTS.includes(v as any)
        ) {
          state[k] = 'recap';
        } else {
          state[k] = v;
        }
      } else {
        rest[k] = v;
      }
    }
    if (Object.keys(state).length > 0) {
      rest.state = state;
    }
    return rest;
  },
  z.object({
    summaryBullets: z.array(z.string()).default([]),
    state: TutorStateSchema,
  }),
);

const SUMMARY_SYSTEM = `You compress NEET-PG/INICET tutoring chats into compact memory.
Return ONLY valid JSON.

Required fields:
- summaryBullets: string[] (array of strings, 2 to 6 short bullets, each concrete)
- state.activeMode: MUST be one of ["diagnose", "explain", "checkpoint", "advance", "recap", "compare", "tangent_parked"]
- state.lastStudentIntent: MUST be one of ["clarify_doubt", "direct_teach", "quiz_me", "compare", "explain_wrong_answer", "recap", "tangent", "advance"]

Goals:
- Preserve what the student is currently stuck on.
- Preserve what was already explained or resolved.
- Preserve misconceptions and concepts Guru should not immediately re-ask.
- Preserve the next micro-goal so future turns keep progressing.

Rules:
- Do not invent enum values for activeMode or lastStudentIntent.
- state.questionConceptsAlreadyAsked and state.avoidReaskingConcepts should use short concept keys or phrases, not full sentences.
- If the student said "I don't know", asked for direct teaching, or failed a concept, include that concept in avoidReaskingConcepts.
- If the conversation drifted, capture the side topic in tangentParkingLot and keep nextMicroGoal focused on the main topic.
- Do not invent mastery. Only mark concepts resolved if the chat actually resolved them.`;

export function getDefaultGuruTutorState(topicName: string): GuruTutorState {
  return {
    version: GURU_TUTOR_STATE_VERSION,
    currentTopicFocus: topicName,
    currentSubtopic: '',
    activeMode: 'diagnose',
    lastStudentIntent: 'clarify_doubt',
    openDoubts: [],
    resolvedDoubts: [],
    misconceptions: [],
    prerequisitesExplained: [],
    factsConfirmed: [],
    questionConceptsAlreadyAsked: [],
    avoidReaskingConcepts: [],
    nextMicroGoal: '',
    tangentParkingLot: [],
  };
}

export function parseGuruTutorState(
  stateJson: string | null | undefined,
  topicName: string,
): GuruTutorState {
  if (!stateJson?.trim()) {
    return getDefaultGuruTutorState(topicName);
  }

  try {
    const parsed = TutorStateSchema.parse(JSON.parse(stateJson));
    return {
      ...getDefaultGuruTutorState(topicName),
      ...parsed,
      version: GURU_TUTOR_STATE_VERSION,
      currentTopicFocus: parsed.currentTopicFocus || topicName,
    };
  } catch {
    return getDefaultGuruTutorState(topicName);
  }
}

export async function maybeSummarizeGuruSession(
  threadId: number,
  topicName: string,
): Promise<void> {
  const count = await getChatMessageCount(threadId);
  const row = await getSessionMemoryRow(threadId);
  const lastAt = row?.messagesAtLastSummary ?? 0;
  if (count - lastAt < GURU_SESSION_SUMMARY_INTERVAL) return;

  const history = await getChatHistory(threadId, 48);
  if (history.length === 0) return;

  const slice = history.slice(-24);
  const transcript = slice
    .map((m) => `${m.role === 'user' ? 'Student' : 'Guru'}: ${m.message}`)
    .join('\n');
  const prev = (row?.summaryText ?? '').trim();
  const prevState = parseGuruTutorState(row?.stateJson, topicName);

  const userContent = [
    prev
      ? `Previous summary (update and merge, do not repeat verbatim if outdated):\n${prev}\n`
      : '',
    `Previous tutor state JSON:\n${JSON.stringify(prevState, null, 2)}\n`,
    `Recent messages:\n${transcript}`,
    '\nReturn updated memory JSON.',
  ].join('\n');

  const messages: ModelMessage[] = [{ role: 'user', content: userContent.slice(0, 12000) }];

  try {
    const profile = await profileRepository.getProfile();
    const isGpt4MiniSupported = profile?.chatgptConnected;
    const forceOrder: ProviderId[] = isGpt4MiniSupported
      ? ['chatgpt']
      : ['gemini', 'openrouter', 'groq'];
    const model = createGuruFallbackModel({
      profile,
      forceOrder,
    });
    const { object: parsed } = await generateObject({
      model,
      system: SUMMARY_SYSTEM,
      messages,
      schema: SummaryPayloadSchema,
    });
    const summary = parsed.summaryBullets
      .map((bullet) => bullet.trim())
      .filter(Boolean)
      .map((bullet) => (bullet.startsWith('-') ? bullet : `- ${bullet}`))
      .join('\n');
    if (!summary) return;
    const nextState: GuruTutorState = {
      ...getDefaultGuruTutorState(topicName),
      ...parsed.state,
      version: GURU_TUTOR_STATE_VERSION,
      currentTopicFocus: parsed.state.currentTopicFocus || topicName,
    };
    await upsertSessionMemory(threadId, topicName, summary, count, JSON.stringify(nextState));
  } catch (e) {
    if (__DEV__) console.warn('[GuruChat] Session summary skipped:', e);
  }
}
