import { Rating } from 'ts-fsrs';

export function mapConfidenceToRating(confidence: number): Rating {
  // App confidence is 0-3:
  // 0 = Again, 1 = Hard, 2 = Good, 3 = Easy
  if (confidence <= 0) return Rating.Again;
  if (confidence === 1) return Rating.Hard;
  if (confidence === 2) return Rating.Good;
  return Rating.Easy;
}

export function selectReviewLogByConfidence<T>(logs: Record<number, T>, confidence: number): T {
  const rating = mapConfidenceToRating(confidence);
  return logs[rating];
}
