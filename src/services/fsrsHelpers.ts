import { Rating } from 'ts-fsrs';

export function mapConfidenceToRating(confidence: number): Rating {
  if (confidence <= 1) return Rating.Again;
  if (confidence === 2) return Rating.Hard;
  if (confidence === 3) return Rating.Good;
  return Rating.Easy;
}

export function selectReviewLogByConfidence<T>(logs: Record<number, T>, confidence: number): T {
  const rating = mapConfidenceToRating(confidence);
  return logs[rating];
}
