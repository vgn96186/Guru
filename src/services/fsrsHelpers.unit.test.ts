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
});
