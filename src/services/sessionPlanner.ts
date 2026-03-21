import type {
  Agenda,
  AgendaItem,
  Mood,
  SessionMode,
  TopicWithProgress,
  ContentType,
} from '../types';
import { getAllTopicsWithProgress } from '../db/queries/topics';
import { getRecentlyStudiedTopicNames } from '../db/queries/sessions';
import { profileRepository } from '../db/repositories';
import { planSessionWithAI } from './aiService';
import { MS_PER_DAY } from '../constants/time';
import { getMoodContentTypes } from '../constants/prompts';

interface BuildSessionOptions {
  focusTopicId?: number;
  focusTopicIds?: number[];
  preferredActionType?: 'study' | 'review' | 'deep_dive';
  mode?: SessionMode;
}

function scoreTopicForSession(
  topic: TopicWithProgress,
  mood: Mood,
  recentParentIds?: Set<number>,
): number {
  let score = 0;

  // Base: INICET priority (1-10 scale)
  score += topic.inicetPriority * 1.5;

  // FSRS Scoring
  if (topic.progress.status === 'unseen') {
    score += 15; // Highest priority for new cards
  } else if (topic.progress.fsrsDue) {
    const dueTime = new Date(topic.progress.fsrsDue).getTime();
    const nowTime = Date.now();

    if (nowTime > dueTime) {
      // Overdue cards get a massive boost based on how overdue they are, capped
      const daysOverdue = (nowTime - dueTime) / MS_PER_DAY;
      score += 10 + Math.min(daysOverdue * 2, 10);
    } else {
      // Not due yet, penalty
      const daysUntilDue = (dueTime - nowTime) / MS_PER_DAY;
      score -= daysUntilDue * 5;
    }
  }

  // Recency penalty: avoid immediate repetition (within 24 hours unless due)
  if (topic.progress.lastStudiedAt) {
    const hoursSince = (Date.now() - topic.progress.lastStudiedAt) / 3600000;
    if (hoursSince < 12) score -= 20;
  }

  // Sibling/parent recency penalty: if any topic sharing the same parent was
  // recently studied, penalize this topic to avoid clustering siblings
  // (e.g. studying all 8 Brachial Plexus sub-topics in one session)
  if (topic.parentTopicId && recentParentIds?.has(topic.parentTopicId)) {
    score -= 15;
  }

  // Mood adjustments
  if (mood === 'tired' || mood === 'stressed') {
    if (topic.progress.status === 'unseen') score -= 10;
    if (topic.progress.status === 'mastered') score += 5; // easy win
  }
  if (mood === 'energetic') {
    if (topic.progress.status === 'unseen') score += 5;
    if (topic.inicetPriority >= 8) score += 5;
  }

  // Nemesis Massive Boost
  if (topic.progress.isNemesis) {
    score += 50; // Force nemesis topics to the top of the queue
  }

  return score;
}

function topicDueDate(topic: TopicWithProgress): string | null {
  return topic.progress.fsrsDue ? topic.progress.fsrsDue.slice(0, 10) : null;
}

function getSessionMode(mood: Mood): SessionMode {
  if (mood === 'distracted') return 'sprint';
  if (mood === 'tired' || mood === 'stressed') return 'gentle';
  if (mood === 'energetic') return 'deep';
  return 'normal';
}

function getSessionLength(mood: Mood, preferred: number): number {
  if (mood === 'distracted') return 10;
  if (mood === 'stressed') return 20;
  if (mood === 'tired') return 30;
  return preferred;
}

function resolveFocusedContentTypes(
  topic: TopicWithProgress,
  safeContentTypes: ContentType[],
  blockedContentTypes: Set<ContentType>,
  preferredActionType?: 'study' | 'review' | 'deep_dive',
): ContentType[] {
  let focusedTypes = safeContentTypes;

  if (preferredActionType === 'review') {
    focusedTypes = !blockedContentTypes.has('quiz')
      ? ['quiz' as ContentType]
      : ['keypoints' as ContentType];
  } else if (preferredActionType === 'deep_dive') {
    focusedTypes = (['keypoints', 'teach_back', 'quiz'] as ContentType[]).filter(
      (ct) => !blockedContentTypes.has(ct),
    );
    if (focusedTypes.length === 0) focusedTypes = safeContentTypes;
  }

  const today = new Date().toISOString().slice(0, 10);
  if (topicDueDate(topic) && topicDueDate(topic)! <= today && !blockedContentTypes.has('quiz')) {
    focusedTypes = ['quiz' as ContentType];
  }

  return focusedTypes;
}

export async function buildSession(
  mood: Mood,
  preferredMinutes: number,
  apiKey: string,
  orKey?: string,
  groqKey?: string,
  options?: BuildSessionOptions,
): Promise<Agenda> {
  const profile = await profileRepository.getProfile();
  const focusSubjectIds = profile.focusSubjectIds ?? [];
  const blockedContentTypes = new Set<ContentType>(profile.blockedContentTypes ?? []);

  const allTopics = await getAllTopicsWithProgress();
  const recentTopics = await getRecentlyStudiedTopicNames(3);

  const sessionMinutes = getSessionLength(mood, preferredMinutes);
  const mode = getSessionMode(mood);
  const rawContentTypes = getMoodContentTypes(mood);
  const contentTypes = rawContentTypes.filter((ct) => !blockedContentTypes.has(ct));
  const safeContentTypes = contentTypes.length > 0 ? contentTypes : ['keypoints' as ContentType];
  const today = new Date().toISOString().slice(0, 10);
  const explicitTopicIds = options?.focusTopicIds?.length
    ? options.focusTopicIds
    : options?.focusTopicId
      ? [options.focusTopicId]
      : [];

  if (explicitTopicIds.length > 0) {
    const explicitTopics = explicitTopicIds
      .map((id) => allTopics.find((t) => t.id === id))
      .filter((topic): topic is TopicWithProgress => Boolean(topic));

    if (explicitTopics.length > 0) {
      const sortedTopics = [...explicitTopics].sort((a, b) => {
        if (options?.preferredActionType === 'review') {
          const aDue = topicDueDate(a) ?? '9999-12-31';
          const bDue = topicDueDate(b) ?? '9999-12-31';
          return aDue.localeCompare(bDue) || b.inicetPriority - a.inicetPriority;
        }
        if (options?.preferredActionType === 'deep_dive') {
          return (
            b.inicetPriority - a.inicetPriority || a.progress.confidence - b.progress.confidence
          );
        }
        return b.inicetPriority - a.inicetPriority;
      });

      const slicedTopics = sortedTopics.slice(
        0,
        Math.max(1, Math.min(4, options?.preferredActionType === 'review' ? 4 : 3)),
      );

      const items = slicedTopics.map((topic) => ({
        topic,
        contentTypes: resolveFocusedContentTypes(
          topic,
          safeContentTypes,
          blockedContentTypes,
          options?.preferredActionType,
        ),
        estimatedMinutes: Math.max(12, Math.min(topic.estimatedMinutes, 35)),
      }));

      const totalMinutes = Math.max(
        12,
        Math.min(
          sessionMinutes,
          items.reduce((sum, item) => sum + item.estimatedMinutes, 0),
        ),
      );
      const focusNames = slicedTopics.map((topic) => topic.name);

      return {
        items,
        totalMinutes,
        focusNote: `Focused ${options?.preferredActionType ?? 'study'}: ${focusNames.join(' + ')}`,
        mode: options?.preferredActionType === 'deep_dive' ? 'deep' : mode,
        guruMessage:
          options?.preferredActionType === 'review'
            ? `Review set ready: ${focusNames.slice(0, 2).join(', ')}${focusNames.length > 2 ? ' and more' : ''}.`
            : `Focused set ready: ${focusNames.slice(0, 2).join(', ')}${focusNames.length > 2 ? ' and more' : ''}.`,
      };
    }
  }

  // Apply focus filter — if subjects are pinned, restrict to those
  const topicPool =
    focusSubjectIds.length > 0
      ? allTopics.filter((t) => focusSubjectIds.includes(t.subjectId))
      : allTopics;

  if (topicPool.length === 0) {
    throw new Error(
      'No topics available for this session. Try adding topics to your syllabus first.',
    );
  }

  // Build set of parent IDs for topics studied in the last 24 hours
  // to penalize sibling clustering (e.g. all Brachial Plexus sub-topics)
  const recentParentIds = new Set<number>();
  for (const t of topicPool) {
    if (
      t.parentTopicId &&
      t.progress.lastStudiedAt &&
      Date.now() - t.progress.lastStudiedAt < MS_PER_DAY
    ) {
      recentParentIds.add(t.parentTopicId);
    }
  }

  // Score and rank all topics
  const scored = topicPool
    .map((t) => ({ ...t, score: scoreTopicForSession(t, mood, recentParentIds) }))
    .sort((a, b) => b.score - a.score);

  // Take top 15 as candidates
  const candidates = scored.slice(0, 15);

  // ── Warmup fast path: unlimited quiz questions, no AI call, no breaks ────────
  if (options?.mode === 'warmup') {
    const warmupTopics = scored.length > 0 ? scored : candidates;
    return {
      items: warmupTopics.map((t) => ({
        topic: t,
        contentTypes: !blockedContentTypes.has('quiz')
          ? ['quiz' as ContentType]
          : ['keypoints' as ContentType],
        estimatedMinutes: 2,
      })),
      totalMinutes: 60,
      focusNote: 'Quiz — end anytime',
      mode: 'warmup' as SessionMode,
      guruMessage: "Let's go. Stop whenever you're ready.",
      skipBreaks: true,
    };
  }

  // ── MCQ Block fast path: 12 topics, quiz-only, no breaks ────────────────────
  if (options?.mode === 'mcq_block') {
    const blockTopics = scored.slice(0, 12);
    return {
      items: blockTopics.map((t) => ({
        topic: t,
        contentTypes: !blockedContentTypes.has('quiz')
          ? ['quiz' as ContentType]
          : ['keypoints' as ContentType],
        estimatedMinutes: 5,
      })),
      totalMinutes: 60,
      focusNote: 'MCQ Block: rapid-fire quiz sprint',
      mode: 'mcq_block' as SessionMode,
      guruMessage: 'Full MCQ block. No breaks. Stay focused.',
      skipBreaks: true,
    };
  }

  // Ask AI to pick from candidates (skip AI entirely if no API key configured)
  let agendaResponse: { selectedTopicIds: number[]; focusNote: string; guruMessage: string };
  const hasAiKey =
    !!apiKey?.trim() || !!orKey?.trim() || !!groqKey?.trim() || profile.useLocalModel;
  if (hasAiKey) {
    try {
      agendaResponse = await planSessionWithAI(candidates, sessionMinutes, mood, recentTopics);
    } catch {
      // Fallback: just take top 2-3 by score
      const count = mode === 'sprint' ? 1 : mode === 'gentle' ? 1 : 2;
      const recentSet = new Set(recentTopics);
      const fallbackTopics = candidates.filter((t) => !recentSet.has(t.name)).slice(0, count);
      if (fallbackTopics.length === 0 && candidates.length > 0) fallbackTopics.push(candidates[0]);
      agendaResponse = {
        selectedTopicIds: fallbackTopics.map((t) => t.id),
        focusNote: `Today: ${fallbackTopics.map((t) => t.name).join(' + ')}`,
        guruMessage:
          mode === 'gentle'
            ? 'Take it easy today. Small steps still move you forward.'
            : "Let's get started. You've got this.",
      };
    }
  } else {
    // No AI keys at all — use smart local fallback (no network call)
    const count =
      mode === 'sprint' ? 1 : mode === 'gentle' ? 1 : Math.min(3, Math.ceil(sessionMinutes / 15));
    const recentSet = new Set(recentTopics);
    const fallbackTopics = candidates.filter((t) => !recentSet.has(t.name)).slice(0, count);
    if (fallbackTopics.length === 0 && candidates.length > 0) fallbackTopics.push(candidates[0]);
    const gentleMessages = [
      'Take it easy today. Small steps still move you forward.',
      'No pressure. Even reviewing one topic is progress.',
      "Consistency > intensity. You showed up — that's what matters.",
    ];
    const normalMessages = [
      "Let's get started. You've got this.",
      'Your future self will thank you for this session.',
      "Focus mode: ON. Let's make this count.",
    ];
    const msgs = mode === 'gentle' ? gentleMessages : normalMessages;
    agendaResponse = {
      selectedTopicIds: fallbackTopics.map((t) => t.id),
      focusNote: `Today: ${fallbackTopics.map((t) => t.name).join(' + ')}`,
      guruMessage: msgs[Math.floor(Math.random() * msgs.length)],
    };
  }

  const topicMap = new Map(candidates.map((t) => [t.id, t]));
  const items: AgendaItem[] = agendaResponse.selectedTopicIds
    .map((id) => topicMap.get(id))
    .filter(Boolean)
    .map((topic) => {
      // SRS Override: If topic is strictly due, FORCE QUIZ only.
      const dueDate = topicDueDate(topic!);
      if (dueDate && dueDate <= today && !blockedContentTypes.has('quiz')) {
        return {
          topic: topic!,
          contentTypes: ['quiz' as ContentType],
          estimatedMinutes: topic!.estimatedMinutes,
        };
      }
      return {
        topic: topic!,
        contentTypes: safeContentTypes,
        estimatedMinutes: topic!.estimatedMinutes,
      };
    });

  // Fallback if AI returned bad IDs
  if (items.length === 0) {
    const fallback = candidates[0];
    items.push({
      topic: fallback,
      contentTypes: safeContentTypes,
      estimatedMinutes: fallback.estimatedMinutes,
    });
  }

  return {
    items,
    totalMinutes: sessionMinutes,
    focusNote: agendaResponse.focusNote,
    mode,
    guruMessage: agendaResponse.guruMessage,
  };
}
