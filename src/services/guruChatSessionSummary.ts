import { z } from 'zod';
import { getChatHistory, getChatMessageCount } from '../db/queries/aiCache';
import { getSessionMemoryRow, upsertSessionMemory } from '../db/queries/guruChatMemory';
import { generateJSONWithRouting } from './ai/generate';
import { NON_STUDY_PROVIDER_ORDER } from '../types';
import type { Message } from './ai/types';

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

const SummaryPayloadSchema = z.object({
  summaryBullets: z.array(z.string()).min(1).max(6),
  state: TutorStateSchema,
});

const SUMMARY_SYSTEM = `You compress NEET-PG/INICET tutoring chats into compact memory.
Return strict JSON only.

Goals:
- Preserve what the student is currently stuck on.
- Preserve what was already explained or resolved.
- Preserve misconceptions and concepts Guru should not immediately re-ask.
- Preserve the next micro-goal so future turns keep progressing.

Rules:
- summaryBullets: 2 to 6 short bullets, each one concrete.
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

  const messages: Message[] = [
    { role: 'system', content: SUMMARY_SYSTEM },
    { role: 'user', content: userContent.slice(0, 12000) },
  ];

  try {
    const { parsed } = await generateJSONWithRouting(
      messages,
      SummaryPayloadSchema,
      'low',
      true,
      undefined,
      NON_STUDY_PROVIDER_ORDER,
    );
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
