import { fsrs, createEmptyCard, type Card, type RecordLogItem, Rating, State } from 'ts-fsrs';

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

export function mapConfidenceToRating(confidence: number): Rating {
  // confidence 1-2 = again/hard, 3-4 = good, 5 = easy
  if (confidence <= 2) return Rating.Again;
  if (confidence === 3) return Rating.Hard;
  if (confidence === 4) return Rating.Good;
  return Rating.Easy;
}
