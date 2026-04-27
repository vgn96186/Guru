/**
 * AI planning tools — LLM-powered variants of planning/agenda/replan flows.
 *
 * Distinct from `planningTools.ts`, which contains DB-heuristic-only tools.
 * These tools are the canonical home for the `generateObject` calls that
 * previously lived inline in `planning.ts`. `planning.ts` now delegates here.
 */

import { z } from 'zod';
import { tool } from '../tool';
import type { ProviderId } from '../../../../types';
import {
  SYSTEM_PROMPT,
  buildAgendaPrompt,
  buildAccountabilityPrompt,
  buildDailyAgendaPrompt,
  buildReplanPrompt,
} from '../../../../constants/prompts';
import { AgendaSchema, DailyAgendaSchema } from '../../schemas';
import { profileRepository } from '../../../../db/repositories/profileRepository';
import { createGuruFallbackModel } from '../providers/guruFallback';
import { generateObject } from '../generateObject';
import type { ModelMessage } from '../spec';

/**
 * Planning calls historically forced the chain to start at Groq because the
 * prompts are latency-sensitive. Preserve that ordering here.
 */
const GROQ_FIRST_ORDER: ProviderId[] = [
  'groq',
  'openrouter',
  'deepseek',
  'cloudflare',
  'github',
  'gemini',
  'gemini_fallback',
  'agentrouter',
  'kilo',
  'chatgpt',
  'github_copilot',
  'gitlab_duo',
  'poe',
  'qwen',
];

async function buildModel() {
  const profile = await profileRepository.getProfile();
  return createGuruFallbackModel({ profile, forceOrder: GROQ_FIRST_ORDER });
}

// ─── plan_session_ai ────────────────────────────────────────────────────────

const CandidateSchema = z.object({
  id: z.number(),
  name: z.string(),
  subject: z.string(),
  priority: z.any(),
  status: z.any(),
  score: z.number(),
});

const MoodSchema = z.any();

export const planSessionAiTool = tool({
  name: 'plan_session_ai',
  description:
    'LLM-curated session plan: pick 2-4 topics from candidates for a given session length and mood.',
  inputSchema: z.object({
    candidates: z.array(CandidateSchema),
    sessionMinutes: z.number(),
    mood: MoodSchema,
    recentTopics: z.array(z.string()),
  }),
  execute: async ({ candidates, sessionMinutes, mood, recentTopics }) => {
    const userPrompt = buildAgendaPrompt(candidates, sessionMinutes, mood, recentTopics);
    const messages: ModelMessage[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ];
    const { object } = await generateObject({
      model: await buildModel(),
      messages,
      schema: AgendaSchema,
    });
    return object;
  },
});

// ─── accountability_messages ────────────────────────────────────────────────

const AccountabilityStatsSchema = z.object({
  displayName: z.string(),
  streak: z.number(),
  weakestTopics: z.array(z.string()),
  nemesisTopics: z.array(z.string()),
  dueTopics: z.array(z.string()),
  lastStudied: z.string(),
  daysToInicet: z.number(),
  daysToNeetPg: z.number(),
  coveragePercent: z.number(),
  masteredCount: z.number(),
  totalTopics: z.number(),
  lastMood: z.any().nullable(),
  guruFrequency: z.enum(['rare', 'normal', 'frequent', 'off']),
});

const AccountabilityOutputSchema = z.object({
  messages: z.array(z.object({ title: z.string(), body: z.string(), scheduledFor: z.string() })),
});

export const accountabilityMessagesTool = tool({
  name: 'accountability_messages',
  description: 'Generate scheduled accountability notifications for the student.',
  inputSchema: AccountabilityStatsSchema,
  execute: async (stats) => {
    const userPrompt = buildAccountabilityPrompt(stats);
    const messages: ModelMessage[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ];

    const profile = await profileRepository.getProfile();
    const isGpt4MiniSupported = profile?.chatgptConnected;
    const forceOrder: ProviderId[] = isGpt4MiniSupported
      ? ['chatgpt']
      : ['gemini', 'openrouter', 'groq'];

    const { object } = await generateObject({
      model: createGuruFallbackModel({ profile, forceOrder }),
      messages,
      schema: AccountabilityOutputSchema,
    });
    return { messages: object.messages };
  },
});

// ─── guru_presence_messages ─────────────────────────────────────────────────

const GuruTriggerSchema = z.enum([
  'periodic',
  'card_done',
  'quiz_correct',
  'quiz_wrong',
  'again_rated',
]);
const GuruPresenceMessageSchema = z.object({ text: z.string(), trigger: GuruTriggerSchema });
const GuruPresenceMessagesArraySchema = z.array(GuruPresenceMessageSchema);
const GuruPresenceMessagesResponseSchema = z.union([
  GuruPresenceMessagesArraySchema,
  z.object({ messages: GuruPresenceMessagesArraySchema }),
]);

export const guruPresenceMessagesTool = tool({
  name: 'guru_presence_messages',
  description: 'Generate ambient "Guru-working-alongside-you" presence messages.',
  inputSchema: z.object({
    topicNames: z.array(z.string()),
    allTopicNames: z.array(z.string()),
  }),
  execute: async ({ topicNames, allTopicNames }) => {
    const guruTopic =
      allTopicNames[Math.floor(Math.random() * allTopicNames.length)] ?? 'Biochemistry';
    const systemPrompt = `You are Guru, a study companion working alongside a medical student. You are currently studying ${guruTopic}. Be brief, warm, and grounding.`;
    const userPrompt = `The student is studying: ${topicNames.join(', ')}.
Generate exactly 6 ambient presence messages as JSON.
Return one object with a "messages" array. Each item has "text" (1-2 short sentences) and "trigger" (one of: periodic, card_done, quiz_correct, quiz_wrong, again_rated).
Include 2 "periodic" messages and 1 each of the other 4. Reference their topics or yours naturally.
Return only valid JSON: {"messages":[{"text":"...","trigger":"..."},...]}`;
    const { object } = await generateObject({
      model: await buildModel(),
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      schema: GuruPresenceMessagesResponseSchema,
    });
    const normalized = Array.isArray(object) ? object : object.messages;
    return { messages: normalized };
  },
});

// ─── daily_agenda_ai ────────────────────────────────────────────────────────

export const dailyAgendaAiTool = tool({
  name: 'daily_agenda_ai',
  description:
    'LLM-generated full-day NEET-PG study plan, using due/weak topic lists and exam horizons.',
  inputSchema: z.object({
    displayName: z.string(),
    stats: z.object({
      streak: z.number(),
      daysToInicet: z.number(),
      daysToNeetPg: z.number(),
      coveragePercent: z.number(),
      dueTopics: z.array(z.object({ id: z.number(), name: z.string(), subject: z.string() })),
      weakTopics: z.array(z.object({ id: z.number(), name: z.string(), subject: z.string() })),
      recentTopics: z.array(z.string()),
    }),
    availableMinutes: z.number().optional(),
  }),
  execute: async ({ displayName, stats, availableMinutes = 480 }) => {
    const userPrompt = buildDailyAgendaPrompt(displayName, stats, availableMinutes);
    const { object } = await generateObject({
      model: await buildModel(),
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      schema: DailyAgendaSchema,
    });
    return object;
  },
});

// ─── replan_day_ai ──────────────────────────────────────────────────────────

export const replanDayAiTool = tool({
  name: 'replan_day_ai',
  description: 'Redistribute remaining study time after completed/missed blocks.',
  inputSchema: z.object({
    currentPlan: z.any(),
    completedBlockIds: z.array(z.string()),
    missedBlockIds: z.array(z.string()),
    remainingMinutes: z.number(),
  }),
  execute: async ({ currentPlan, completedBlockIds, missedBlockIds, remainingMinutes }) => {
    const userPrompt = buildReplanPrompt(
      currentPlan,
      completedBlockIds,
      missedBlockIds,
      remainingMinutes,
    );
    const { object } = await generateObject({
      model: await buildModel(),
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      schema: DailyAgendaSchema,
    });
    return object;
  },
});

export const guruAiPlanningTools = {
  plan_session_ai: planSessionAiTool,
  accountability_messages: accountabilityMessagesTool,
  guru_presence_messages: guruPresenceMessagesTool,
  daily_agenda_ai: dailyAgendaAiTool,
  replan_day_ai: replanDayAiTool,
};
