import { Rating } from 'ts-fsrs';
import { mapConfidenceToRating, selectReviewLogByConfidence } from './fsrsHelpers';

describe('fsrsHelpers', () => {
  it('maps confidence to fsrs rating', () => {
    expect(mapConfidenceToRating(-1)).toBe(Rating.Again);
    expect(mapConfidenceToRating(0)).toBe(Rating.Again);
    expect(mapConfidenceToRating(1)).toBe(Rating.Again);
    expect(mapConfidenceToRating(2)).toBe(Rating.Hard);
    expect(mapConfidenceToRating(3)).toBe(Rating.Good);
    expect(mapConfidenceToRating(4)).toBe(Rating.Easy);
    expect(mapConfidenceToRating(9)).toBe(Rating.Easy);
  });

  it('selects review log by confidence', () => {
    const logs: Record<number, string> = {
      [Rating.Again]: 'again',
      [Rating.Hard]: 'hard',
      [Rating.Good]: 'good',
      [Rating.Easy]: 'easy',
    };

    expect(selectReviewLogByConfidence(logs, 1)).toBe('again');
    expect(selectReviewLogByConfidence(logs, 2)).toBe('hard');
    expect(selectReviewLogByConfidence(logs, 3)).toBe('good');
    expect(selectReviewLogByConfidence(logs, 4)).toBe('easy');
  });

  it('maps non-integer confidence to nearest rating', () => {
    expect(mapConfidenceToRating(0.5)).toBe(Rating.Again);
    expect(mapConfidenceToRating(1.5)).toBe(Rating.Again);
    expect(mapConfidenceToRating(2.5)).toBe(Rating.Hard);
    expect(mapConfidenceToRating(3.5)).toBe(Rating.Good);
    expect(mapConfidenceToRating(4.5)).toBe(Rating.Easy);
  });

  it('returns undefined if rating is missing from logs', () => {
    const logs: Partial<Record<Rating, string>> = {
      [Rating.Again]: 'again',
    };
    expect(selectReviewLogByConfidence(logs as Record<number, string>, 2)).toBeUndefined();
  });
});
