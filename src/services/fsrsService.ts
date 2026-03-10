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
  // App confidence is 0–3:
  //   0 = Again (complete fail)
  //   1 = Hard  (barely recalled)
  //   2 = Good  (recalled with effort)
  //   3 = Easy  (instant recall)
  if (confidence <= 0) return Rating.Again;
  if (confidence === 1) return Rating.Hard;
  if (confidence === 2) return Rating.Good;
  return Rating.Easy;
}
