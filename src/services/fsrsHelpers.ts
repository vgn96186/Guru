import { Rating } from 'ts-fsrs';

export function mapConfidenceToRating(confidence: number): Rating {
  const floored = Math.floor(confidence);
  if (floored <= 1) return Rating.Again;
  if (floored === 2) return Rating.Hard;
  if (floored === 3) return Rating.Good;
  return Rating.Easy;
}

export function selectReviewLogByConfidence<T>(logs: Record<number, T>, confidence: number): T {
  const rating = mapConfidenceToRating(confidence);
  return logs[rating];
}
