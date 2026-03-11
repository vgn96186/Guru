import { fsrs, createEmptyCard, type Card, type RecordLogItem, Rating, State } from 'ts-fsrs';
import { mapConfidenceToRating, selectReviewLogByConfidence } from './fsrsHelpers';

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

export { mapConfidenceToRating };
