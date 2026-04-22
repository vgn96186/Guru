/**
 * planning — public API preserved; implementation delegates to the v2
 * `guruAiPlanningTools` so there is ONE LLM path per capability.
 *
 * Fallback behavior (low-signal agenda detection, hand-built fallback daily
 * agenda, FALLBACK_MESSAGES) stays here because it's pure business logic
 * that should run whether or not the LLM path works.
 */

import type { Mood, TopicWithProgress } from '../../types';
import type { GuruPresenceMessage, AgendaResponse, DailyAgenda } from './types';
import {
  planSessionAiTool,
  accountabilityMessagesTool,
  guruPresenceMessagesTool,
  dailyAgendaAiTool,
  replanDayAiTool,
} from './v2/tools/aiPlanningTools';
import { invokeTool } from './v2/toolRunner';

const FALLBACK_MESSAGES: GuruPresenceMessage[] = [
  {
    text: 'Still here. Working through some Pharmacology while you tackle this.',
    trigger: 'periodic',
  },
  { text: 'Heads down over here. Keep your pace.', trigger: 'periodic' },
  { text: 'Nice. That card is done. One step closer.', trigger: 'card_done' },
  { text: "That's it. Knew you had that one.", trigger: 'quiz_correct' },
  { text: "Tricky question. Don't overthink it — move on.", trigger: 'quiz_wrong' },
  {
    text: 'Good call flagging that. Honest review beats false confidence.',
    trigger: 'again_rated',
  },
];

export async function planSessionWithAI(
  candidates: TopicWithProgress[],
  sessionMinutes: number,
  mood: Mood,
  recentTopics: string[],
): Promise<AgendaResponse> {
  const candidateData = candidates.map((t) => ({
    id: t.id,
    name: t.name,
    subject: t.subjectName,
    priority: t.inicetPriority,
    status: t.progress.status,
    score: t.score ?? 0,
  }));

  return invokeTool(planSessionAiTool, {
    input: { candidates: candidateData, sessionMinutes, mood, recentTopics },
    tag: 'planSessionWithAI',
  }) as Promise<AgendaResponse>;
}

export async function generateAccountabilityMessages(stats: {
  displayName: string;
  streak: number;
  weakestTopics: string[];
  nemesisTopics: string[];
  dueTopics: string[];
  lastStudied: string;
  daysToInicet: number;
  daysToNeetPg: number;
  coveragePercent: number;
  masteredCount: number;
  totalTopics: number;
  lastMood: Mood | null;
  guruFrequency: 'rare' | 'normal' | 'frequent' | 'off';
}): Promise<Array<{ title: string; body: string; scheduledFor: string }>> {
  const result = await invokeTool(accountabilityMessagesTool, {
    input: stats,
    tag: 'accountabilityMessages',
  });
  return result.messages;
}

export async function generateGuruPresenceMessages(
  topicNames: string[],
  allTopicNames: string[],
): Promise<GuruPresenceMessage[]> {
  return invokeTool(guruPresenceMessagesTool, {
    input: { topicNames, allTopicNames },
    tag: 'guruPresenceMessages',
    fallback: () => ({ messages: FALLBACK_MESSAGES }),
  }).then((r) =>
    r.messages.length > 0 ? (r.messages as GuruPresenceMessage[]) : FALLBACK_MESSAGES,
  );
}

export async function generateDailyAgendaWithRouting(
  displayName: string,
  stats: {
    streak: number;
    daysToInicet: number;
    daysToNeetPg: number;
    coveragePercent: number;
    dueTopics: Array<{ id: number; name: string; subject: string }>;
    weakTopics: Array<{ id: number; name: string; subject: string }>;
    recentTopics: string[];
  },
  availableMinutes: number = 480,
): Promise<DailyAgenda> {
  return invokeTool(dailyAgendaAiTool, {
    input: { displayName, stats, availableMinutes },
    tag: 'dailyAgenda',
    fallback: () => buildFallbackDailyAgenda(displayName, stats, availableMinutes),
  }).then((plan) =>
    isLowSignalAgenda(plan as DailyAgenda)
      ? buildFallbackDailyAgenda(displayName, stats, availableMinutes)
      : (plan as DailyAgenda),
  );
}

export async function replanDayWithRouting(
  currentPlan: DailyAgenda,
  completedBlockIds: string[],
  missedBlockIds: string[],
  remainingMinutes: number,
): Promise<DailyAgenda> {
  return invokeTool(replanDayAiTool, {
    input: { currentPlan, completedBlockIds, missedBlockIds, remainingMinutes },
    tag: 'replanDay',
  }) as Promise<DailyAgenda>;
}

// ─── Pure logic helpers (kept here; no LLM work) ────────────────────────────

function isLowSignalAgenda(plan: DailyAgenda): boolean {
  const nonBreakBlocks = plan.blocks.filter((block) => block.type !== 'break');
  if (nonBreakBlocks.length === 0) return true;

  const specificBlocks = nonBreakBlocks.filter((block) => block.topicIds.length > 0);
  if (specificBlocks.length < Math.min(2, nonBreakBlocks.length)) return true;

  const genericTitleCount = nonBreakBlocks.filter((block) =>
    /(morning|afternoon|evening|study block|review block|power hour|focus block)/i.test(
      block.title,
    ),
  ).length;
  return genericTitleCount >= Math.ceil(nonBreakBlocks.length / 2);
}

function buildFallbackDailyAgenda(
  displayName: string,
  stats: {
    streak: number;
    daysToInicet: number;
    daysToNeetPg: number;
    coveragePercent: number;
    dueTopics: Array<{ id: number; name: string; subject: string }>;
    weakTopics: Array<{ id: number; name: string; subject: string }>;
    recentTopics: string[];
  },
  availableMinutes: number,
): DailyAgenda {
  const seen = new Set<number>();
  const prioritizedTopics = [...stats.dueTopics, ...stats.weakTopics].filter((topic) => {
    if (seen.has(topic.id)) return false;
    seen.add(topic.id);
    return true;
  });
  const dueIds = new Set(stats.dueTopics.map((topic) => topic.id));

  const blocks: DailyAgenda['blocks'] = [];
  let remaining = Math.max(60, availableMinutes);
  let cursorMinutes = 8 * 60;

  const addBlock = (block: DailyAgenda['blocks'][number]) => {
    blocks.push(block);
    cursorMinutes += block.durationMinutes;
    remaining -= block.durationMinutes;
  };

  prioritizedTopics.slice(0, 4).forEach((topic, index) => {
    if (remaining < 30) return;
    const isDue = dueIds.has(topic.id);
    const type: DailyAgenda['blocks'][number]['type'] =
      index === 2 && remaining >= 45 ? 'test' : isDue ? 'review' : 'study';
    const durationMinutes =
      type === 'test' ? Math.min(45, remaining) : Math.min(index === 0 ? 60 : 45, remaining);

    addBlock({
      id: `fallback-${index + 1}`,
      title:
        type === 'review'
          ? `Rescue ${topic.name}`
          : type === 'test'
            ? `Test ${topic.name}`
            : `Build ${topic.name}`,
      topicIds: [topic.id],
      durationMinutes,
      startTime: formatAgendaTime(cursorMinutes),
      type,
      why: isDue
        ? `${topic.name} in ${topic.subject} is due right now, so it needs immediate review.`
        : `${topic.name} in ${topic.subject} is still weak, so it gets a focused rebuild block.`,
    });

    if ((index === 0 || index === 2) && remaining >= 15) {
      addBlock({
        id: `fallback-break-${index + 1}`,
        title: 'Reset Break',
        topicIds: [],
        durationMinutes: 15,
        startTime: formatAgendaTime(cursorMinutes),
        type: 'break',
        why: 'Short reset so the next block stays sharp.',
      });
    }
  });

  if (blocks.filter((block) => block.type !== 'break').length === 0) {
    addBlock({
      id: 'fallback-review',
      title: 'Catch Up Review',
      topicIds: [],
      durationMinutes: Math.min(60, remaining),
      startTime: formatAgendaTime(cursorMinutes),
      type: 'review',
      why: 'No clear priority topics were available, so use this block to clean up overdue work.',
    });
  }

  const anchorTopic = prioritizedTopics[0]?.name ?? 'your most overdue topic';
  return {
    blocks,
    guruNote: `${displayName}, start with ${anchorTopic}. The vague plan is dead; this one names the actual work.`,
  };
}

function formatAgendaTime(totalMinutes: number) {
  const hours = Math.floor(totalMinutes / 60)
    .toString()
    .padStart(2, '0');
  const minutes = (totalMinutes % 60).toString().padStart(2, '0');
  return `${hours}:${minutes}`;
}
