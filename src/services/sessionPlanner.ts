import type { Agenda, AgendaItem, Mood, SessionMode, TopicWithProgress } from '../types';
import { getAllTopicsWithProgress } from '../db/queries/topics';
import { getRecentlyStudiedTopicNames } from '../db/queries/sessions';
import { planSessionWithAI } from './aiService';
import { getMoodContentTypes } from '../constants/prompts';

function scoreTopicForSession(topic: TopicWithProgress, mood: Mood): number {
  let score = 0;

  // Base: INICET priority (1-10 scale)
  score += topic.inicetPriority * 1.5;

  // Status boost: unseen topics are highest priority
  const statusBoost: Record<string, number> = {
    unseen: 10, seen: 6, reviewed: 3, mastered: 0,
  };
  score += statusBoost[topic.progress.status] ?? 0;

  // Confidence gap: low confidence = higher priority
  score += (5 - topic.progress.confidence) * 2;

  // Recency penalty: avoid immediate repetition
  if (topic.progress.lastStudiedAt) {
    const hoursSince = (Date.now() - topic.progress.lastStudiedAt) / 3_600_000;
    if (hoursSince < 24) score -= 20;
    else if (hoursSince < 48) score -= 10;
  }

  // Mood adjustments
  if (mood === 'tired' || mood === 'stressed') {
    // Prefer topics already seen (for confidence boost)
    if (topic.progress.status === 'unseen') score -= 10;
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
