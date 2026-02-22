import type { Agenda, AgendaItem, Mood, SessionMode, TopicWithProgress, ContentType } from '../types';
import { getAllTopicsWithProgress } from '../db/queries/topics';
import { getRecentlyStudiedTopicNames } from '../db/queries/sessions';
import { getUserProfile } from '../db/queries/progress';
import { planSessionWithAI } from './aiService';
import { getMoodContentTypes } from '../constants/prompts';

function scoreTopicForSession(topic: TopicWithProgress, mood: Mood): number {
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
      const daysOverdue = (nowTime - dueTime) / 86400000;
      score += 10 + Math.min(daysOverdue * 2, 10);
    } else {
      // Not due yet, penalty
      const daysUntilDue = (dueTime - nowTime) / 86400000;
      score -= (daysUntilDue * 5);
    }
  }

  // Recency penalty: avoid immediate repetition (within 24 hours unless due)
  if (topic.progress.lastStudiedAt) {
    const hoursSince = (Date.now() - topic.progress.lastStudiedAt) / 3600000;
    if (hoursSince < 12) score -= 20;
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
  orKey?: string,
): Promise<Agenda> {
  const profile = getUserProfile();
  const focusSubjectIds = profile.focusSubjectIds ?? [];
  const blockedContentTypes = new Set<ContentType>(profile.blockedContentTypes ?? []);

  const allTopics = getAllTopicsWithProgress();
  const recentTopics = getRecentlyStudiedTopicNames(3);

  const sessionMinutes = getSessionLength(mood, preferredMinutes);
  const mode = getSessionMode(mood);

  // Apply focus filter — if subjects are pinned, restrict to those
  const topicPool = focusSubjectIds.length > 0
    ? allTopics.filter(t => focusSubjectIds.includes(t.subjectId))
    : allTopics;

  // Score and rank all topics
  const scored = topicPool
    .map(t => ({ ...t, score: scoreTopicForSession(t, mood) }))
    .sort((a, b) => b.score - a.score);

  // Take top 15 as candidates
  const candidates = scored.slice(0, 15);

  // Ask AI to pick from candidates
  let agendaResponse: { selectedTopicIds: number[]; focusNote: string; guruMessage: string };
  try {
    agendaResponse = await planSessionWithAI(candidates, sessionMinutes, mood, recentTopics, apiKey, orKey);
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

  const rawContentTypes = getMoodContentTypes(mood);
  // Remove blocked content types; keep at least keypoints as fallback
  const contentTypes = rawContentTypes.filter(ct => !blockedContentTypes.has(ct));
  const safeContentTypes = contentTypes.length > 0 ? contentTypes : ['keypoints' as ContentType];
  const today = new Date().toISOString().slice(0, 10);

  const topicMap = new Map(candidates.map(t => [t.id, t]));
  const items: AgendaItem[] = agendaResponse.selectedTopicIds
    .map(id => topicMap.get(id))
    .filter(Boolean)
    .map(topic => {
      // SRS Override: If topic is strictly due, FORCE QUIZ only.
      if (topic!.progress.nextReviewDate && topic!.progress.nextReviewDate <= today && !blockedContentTypes.has('quiz')) {
        return { topic: topic!, contentTypes: ['quiz' as ContentType], estimatedMinutes: topic!.estimatedMinutes };
      }
      return { topic: topic!, contentTypes: safeContentTypes, estimatedMinutes: topic!.estimatedMinutes };
    });

  // Fallback if AI returned bad IDs
  if (items.length === 0) {
    const fallback = candidates[0];
    items.push({ topic: fallback, contentTypes: safeContentTypes, estimatedMinutes: fallback.estimatedMinutes });
  }

  return {
    items,
    totalMinutes: sessionMinutes,
    focusNote: agendaResponse.focusNote,
    mode,
    guruMessage: agendaResponse.guruMessage,
  };
}
