import { getUserProfile, getDailyLog } from '../db/queries/progress';
import type { Agenda, AgendaItem, ContentType, Mood, SessionMode, TopicWithProgress } from '../types';
import { getAllTopicsWithProgress } from '../db/queries/topics';
import { getRecentlyStudiedTopicNames } from '../db/queries/sessions';
import { planSessionWithAI } from './aiService';
import { getMoodContentTypes } from '../constants/prompts';

function getDaysSinceLastActive(): number {
  const profile = getUserProfile();
  if (!profile.lastActiveDate) return 0;

  const lastActive = new Date(profile.lastActiveDate).getTime();
  const now = Date.now();
  return Math.max(0, Math.floor((now - lastActive) / 86400000));
}

function scoreTopicForSession(topic: TopicWithProgress, mood: Mood): number {
  let score = 0;
  const today = new Date().toISOString().slice(0, 10);

  // Base: INICET priority (1-10 scale)
  score += topic.inicetPriority * 1.5;

  // Status boost: unseen topics are highest priority
  const statusBoost: Record<string, number> = {
    unseen: 10, seen: 6, reviewed: 3, mastered: 0,
  };
  score += statusBoost[topic.progress.status] ?? 0;

  // Confidence gap: low confidence = higher priority
  score += (5 - topic.progress.confidence) * 2;

  // DUE REVIEW BOOST: ensure review obligations surface even when unseen backlog is large
  if (topic.progress.nextReviewDate && topic.progress.nextReviewDate <= today) {
    score += 16;
  }

  // VAULT-FIRST-WATCH BOOST: topics marked seen with minimal confidence should be revised early
  const isFirstWatchBaseline =
    topic.progress.status === 'seen'
    && topic.progress.confidence <= 1
    && topic.progress.timesStudied <= 1;
  if (isFirstWatchBaseline) {
    score += 10;
  }

  // NEMESIS OVERRIDE: Massive boost
  if (topic.progress.isNemesis) {
    score += 50;
  }

  // Recency penalty: avoid immediate repetition
  if (topic.progress.lastStudiedAt) {
    const hoursSince = (Date.now() - topic.progress.lastStudiedAt) / 3_600_000;
    // Nemesis topics have a shorter recency penalty to force them back in quicker
    if (topic.progress.isNemesis) {
      if (hoursSince < 12) score -= 30; // Still don't spam them in the same day
    } else {
      if (hoursSince < 24) score -= 20;
      else if (hoursSince < 48) score -= 10;
    }
  }

  // Mood adjustments
  if (mood === 'tired' || mood === 'stressed') {
    // Prefer topics already seen (for confidence boost)
    if (topic.progress.status === 'unseen') score -= 10;
    if (isFirstWatchBaseline) score += 8;
    if (topic.progress.status === 'mastered') score += 5; // easy win
  }
  if (mood === 'energetic') {
    // Prefer harder/unseen topics
    if (topic.progress.status === 'unseen') score += 5;
    if (topic.inicetPriority >= 8) score += 5;
  }

  return score;
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

export async function buildSession(
  mood: Mood,
  preferredMinutes: number,
  apiKey: string,
): Promise<Agenda> {
  const allTopics = getAllTopicsWithProgress();
  const recentTopics = getRecentlyStudiedTopicNames(3);

  // RADICAL FORGIVENESS PROTOCOL
  const daysAway = getDaysSinceLastActive();
  if (daysAway >= 3) {
    const forgivingTopic = allTopics.find(t => t.progress.status !== 'unseen') || allTopics[0];
    return {
      items: [{
        topic: forgivingTopic,
        contentTypes: ['mnemonic'], // Super light cognitive load
        estimatedMinutes: 5
      }],
      totalMinutes: 5,
      focusNote: "Micro-Commitment: Just One Thing.",
      mode: 'gentle',
      guruMessage: `Hey. It's been ${daysAway} days. Life happens. Don't look at the streak, just read this one thing for 60 seconds and you're back on track.`
    };
  }

  const sessionMinutes = getSessionLength(mood, preferredMinutes);
  const mode = getSessionMode(mood);

  // Score and rank all topics
  const scored = allTopics
    .map(t => ({ ...t, score: scoreTopicForSession(t, mood) }))
    .sort((a, b) => b.score - a.score);

  // Take top 15 as candidates
  const candidates = scored.slice(0, 15);

  // Ask AI to pick from candidates
  let agendaResponse: { selectedTopicIds: number[]; focusNote: string; guruMessage: string };
  try {
    agendaResponse = await planSessionWithAI(candidates, sessionMinutes, mood, recentTopics, apiKey);
  } catch {
    // Fallback: just take top 2-3 by score
    const count = mode === 'sprint' ? 1 : mode === 'gentle' ? 1 : 2;
    const recentSet = new Set(recentTopics);
    const fallbackTopics = candidates.filter(t => !recentSet.has(t.name)).slice(0, count);
    agendaResponse = {
      selectedTopicIds: fallbackTopics.map(t => t.id),
      focusNote: `Today: ${fallbackTopics.map(t => t.name).join(' + ')}`,
      guruMessage: mode === 'gentle'
        ? 'Take it easy today. Small steps still move you forward.'
        : 'Let\'s get started. You\'ve got this.',
    };
  }

  const contentTypes = getMoodContentTypes(mood);
  const today = new Date().toISOString().slice(0, 10);

  const topicMap = new Map(candidates.map(t => [t.id, t]));
  const items: AgendaItem[] = agendaResponse.selectedTopicIds
    .map(id => topicMap.get(id))
    .filter(Boolean)
    .map(topic => {
      let selectedTypes = contentTypes;

      // SRS Override: If topic is strictly due, FORCE QUIZ only.
      // This ensures "only correct answers give points" logic dominates the session for this topic.
      if (topic!.progress.nextReviewDate && topic!.progress.nextReviewDate <= today) {
        selectedTypes = ['quiz'];
      }

      // NEMESIS OVERRIDE: Rotate through specialized/active recall modes
      if (topic!.progress.isNemesis) {
        const nemesisModes = ['error_hunt', 'detective', 'teach_back'] as const;
        // Use wrongCount to cycle through the modes so they don't get the same one twice
        const modeIndex = (topic!.progress.wrongCount || 0) % nemesisModes.length;
        selectedTypes = [nemesisModes[modeIndex]];
      }

      return {
        topic: topic!,
        contentTypes: selectedTypes,
        estimatedMinutes: topic!.estimatedMinutes,
      };
    });

  // Fallback if AI returned bad IDs
  if (items.length === 0) {
    const fallback = candidates[0];
    items.push({
      topic: fallback,
      contentTypes,
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

// ── PYQ Sprint ────────────────────────────────────────────────────
// Deterministic, no AI call. Sorted by INICET priority, quiz-only.
// Use for timed exam practice — 4 questions per topic, 90s each.
export function buildPYQSprint(): Agenda {
  const allTopics = getAllTopicsWithProgress();

  // Sort: seen/reviewed topics first (quiz requires some prior exposure),
  // then by inicetPriority DESC within each group
  const sorted = [...allTopics].sort((a, b) => {
    const aKnown = a.progress.status !== 'unseen' ? 1 : 0;
    const bKnown = b.progress.status !== 'unseen' ? 1 : 0;
    if (bKnown !== aKnown) return bKnown - aKnown;
    return b.inicetPriority - a.inicetPriority;
  });

  // Take top 8 topics → 4 Qs each → 32 questions max, ~20 min at 90s/Q
  const selected = sorted.slice(0, 8);

  const items: AgendaItem[] = selected.map(topic => ({
    topic,
    contentTypes: ['quiz'] as ContentType[],
    estimatedMinutes: 3,
  }));

  return {
    items,
    totalMinutes: 20,
    focusNote: 'PYQ Sprint — Exam Conditions. 90 sec per question.',
    mode: 'sprint',
    guruMessage: 'Think fast. No second-guessing. This is exactly what the real exam feels like. 🎯',
  };
}
