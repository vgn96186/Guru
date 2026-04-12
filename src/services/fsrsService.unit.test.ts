import { Rating, State } from 'ts-fsrs';
import { getInitialCard, reviewCard, reviewCardFromConfidence } from './fsrsService';

describe('fsrsService', () => {
  describe('getInitialCard', () => {
    it('should return an initial card with current date', () => {
      const card = getInitialCard();
      expect(card).toBeDefined();
      expect(card.state).toBe(State.New);
      expect(card.last_review).toBeUndefined();
      expect(card.elapsed_days).toBe(0);
      expect(card.scheduled_days).toBe(0);
      expect(card.reps).toBe(0);
      expect(card.lapses).toBe(0);
    });
  });

  describe('reviewCard', () => {
    it('should review a card and return log for Rating.Good', () => {
      const card = getInitialCard();
      const now = new Date();
      const result = reviewCard(card, Rating.Good, now);

      expect(result).toBeDefined();
      expect(result.card).toBeDefined();
      expect(result.log).toBeDefined();
      expect(result.card.state).toBe(State.Learning);
      expect(result.card.reps).toBe(1);
      expect(result.log.rating).toBe(Rating.Good);
    });

    it('should review a card and return log for Rating.Again', () => {
      const card = getInitialCard();
      const now = new Date();
      const result = reviewCard(card, Rating.Again, now);

      expect(result.log.rating).toBe(Rating.Again);
      expect(result.card.state).toBe(State.Learning);
    });
  });

  describe('reviewCardFromConfidence', () => {
    it('should map confidence 0 to Rating.Again', () => {
      const card = getInitialCard();
      const now = new Date();
      const result = reviewCardFromConfidence(card, 0, now);
      expect(result.log.rating).toBe(Rating.Again);
    });

    it('should map confidence 1 to Rating.Hard', () => {
      const card = getInitialCard();
      const now = new Date();
      const result = reviewCardFromConfidence(card, 1, now);
      expect(result.log.rating).toBe(Rating.Hard);
    });

    it('should map confidence 2 to Rating.Good', () => {
      const card = getInitialCard();
      const now = new Date();
      const result = reviewCardFromConfidence(card, 2, now);
      expect(result.log.rating).toBe(Rating.Good);
    });

    it('should map confidence 3 to Rating.Easy', () => {
      const card = getInitialCard();
      const now = new Date();
      const result = reviewCardFromConfidence(card, 3, now);
      expect(result.log.rating).toBe(Rating.Easy);
    });

    it('should map confidence > 3 to Rating.Easy', () => {
      const card = getInitialCard();
      const now = new Date();
      const result = reviewCardFromConfidence(card, 4, now);
      expect(result.log.rating).toBe(Rating.Easy);
    });

    it('should map confidence < 0 to Rating.Again', () => {
      const card = getInitialCard();
      const now = new Date();
      const result = reviewCardFromConfidence(card, -1, now);
      expect(result.log.rating).toBe(Rating.Again);
    });
  });
});
