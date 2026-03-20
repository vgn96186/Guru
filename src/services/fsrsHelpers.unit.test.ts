import { Rating } from 'ts-fsrs';
import { mapConfidenceToRating, selectReviewLogByConfidence } from './fsrsHelpers';

describe('fsrsHelpers', () => {
  it('maps confidence to fsrs rating', () => {
    expect(mapConfidenceToRating(-1)).toBe(Rating.Again);
    expect(mapConfidenceToRating(0)).toBe(Rating.Again);
    expect(mapConfidenceToRating(1)).toBe(Rating.Hard);
    expect(mapConfidenceToRating(2)).toBe(Rating.Good);
    expect(mapConfidenceToRating(3)).toBe(Rating.Easy);
    expect(mapConfidenceToRating(9)).toBe(Rating.Easy);
  });

  it('selects review log by confidence', () => {
    const logs: Record<number, string> = {
      [Rating.Again]: 'again',
      [Rating.Hard]: 'hard',
      [Rating.Good]: 'good',
      [Rating.Easy]: 'easy',
    };

    expect(selectReviewLogByConfidence(logs, 0)).toBe('again');
    expect(selectReviewLogByConfidence(logs, 1)).toBe('hard');
    expect(selectReviewLogByConfidence(logs, 2)).toBe('good');
    expect(selectReviewLogByConfidence(logs, 3)).toBe('easy');
  });

  it('handles non-integer confidence (as currently implemented)', () => {
    // Current behavior: if not <= 0 and not exactly 1 or 2, it returns Easy
    expect(mapConfidenceToRating(0.5)).toBe(Rating.Easy);
    expect(mapConfidenceToRating(1.5)).toBe(Rating.Easy);
    expect(mapConfidenceToRating(2.5)).toBe(Rating.Easy);
  });

  it('returns undefined if rating is missing from logs', () => {
    const logs: Partial<Record<Rating, string>> = {
      [Rating.Again]: 'again',
    };
    expect(selectReviewLogByConfidence(logs as Record<number, string>, 1)).toBeUndefined();
  });
});
