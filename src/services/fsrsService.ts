import { fsrs, createEmptyCard, type Card, type RecordLogItem, Rating, State } from 'ts-fsrs';
import { mapConfidenceToRating, selectReviewLogByConfidence } from './fsrsHelpers';
import type { TopicProgress } from '../types';

const f = fsrs({
  maximum_interval: 365,
});

export function getInitialCard(): Card {
  return createEmptyCard(new Date());
}

export function reviewCard(card: Card, rating: Rating, now: Date = new Date()): RecordLogItem {
  const logs = f.repeat(card, now);
  return logs[rating as keyof typeof logs] as RecordLogItem;
}

export function reviewCardFromConfidence(
  card: Card,
  confidence: number,
  now: Date = new Date(),
): RecordLogItem {
  const logs = f.repeat(card, now) as unknown as Record<number, RecordLogItem>;
  return selectReviewLogByConfidence(logs, confidence);
}

export function buildFsrsCard(progress: TopicProgress): Card {
  if (progress.fsrsLastReview && progress.fsrsDue) {
    return {
      due: new Date(progress.fsrsDue),
      stability: progress.fsrsStability,
      difficulty: progress.fsrsDifficulty,
      elapsed_days: progress.fsrsElapsedDays,
      scheduled_days: progress.fsrsScheduledDays,
      reps: progress.fsrsReps,
      lapses: progress.fsrsLapses,
      state: progress.fsrsState,
      last_review: new Date(progress.fsrsLastReview),
    };
  }
  return getInitialCard();
}

export function previewIntervals(card: Card, now: Date = new Date()): Record<string, number> {
  const logs = f.repeat(card, now);
  return {
    Again: logs[Rating.Again].card.scheduled_days,
    Hard: logs[Rating.Hard].card.scheduled_days,
    Good: logs[Rating.Good].card.scheduled_days,
    Easy: logs[Rating.Easy].card.scheduled_days,
  };
}

export function fsrsStatusFromCard(card: Card): 'seen' | 'reviewed' | 'mastered' {
  if (card.state === State.Learning || card.state === State.Relearning) return 'seen';
  if (card.state === State.Review && card.stability >= 21) return 'mastered';
  return 'reviewed';
}

export { mapConfidenceToRating };
