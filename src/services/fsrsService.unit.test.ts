import { Rating, State } from 'ts-fsrs';
import {
  getInitialCard,
  reviewCard,
  reviewCardFromConfidence,
  buildFsrsCard,
  previewIntervals,
  fsrsStatusFromCard,
} from './fsrsService';
import type { TopicProgress } from '../types';

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
    it('should map confidence 1 to Rating.Again', () => {
      const card = getInitialCard();
      const now = new Date();
      const result = reviewCardFromConfidence(card, 1, now);
      expect(result.log.rating).toBe(Rating.Again);
    });

    it('should map confidence 2 to Rating.Hard', () => {
      const card = getInitialCard();
      const now = new Date();
      const result = reviewCardFromConfidence(card, 2, now);
      expect(result.log.rating).toBe(Rating.Hard);
    });

    it('should map confidence 3 to Rating.Good', () => {
      const card = getInitialCard();
      const now = new Date();
      const result = reviewCardFromConfidence(card, 3, now);
      expect(result.log.rating).toBe(Rating.Good);
    });

    it('should map confidence 4 to Rating.Easy', () => {
      const card = getInitialCard();
      const now = new Date();
      const result = reviewCardFromConfidence(card, 4, now);
      expect(result.log.rating).toBe(Rating.Easy);
    });

    it('should map confidence 0 to Rating.Again', () => {
      const card = getInitialCard();
      const now = new Date();
      const result = reviewCardFromConfidence(card, 0, now);
      expect(result.log.rating).toBe(Rating.Again);
    });

    it('should map confidence > 4 to Rating.Easy', () => {
      const card = getInitialCard();
      const now = new Date();
      const result = reviewCardFromConfidence(card, 5, now);
      expect(result.log.rating).toBe(Rating.Easy);
    });
  });

  describe('buildFsrsCard', () => {
    it('should build a card from TopicProgress with FSRS fields', () => {
      const now = new Date();
      const progress: TopicProgress = {
        topicId: 1,
        status: 'reviewed',
        confidence: 3,
        lastStudiedAt: now.getTime(),
        timesStudied: 5,
        xpEarned: 30,
        nextReviewDate: null,
        userNotes: '',
        fsrsDue: now.toISOString(),
        fsrsStability: 10,
        fsrsDifficulty: 5,
        fsrsElapsedDays: 7,
        fsrsScheduledDays: 7,
        fsrsReps: 5,
        fsrsLapses: 1,
        fsrsState: State.Review,
        fsrsLastReview: now.toISOString(),
        wrongCount: 0,
        isNemesis: false,
      };
      const card = buildFsrsCard(progress);
      expect(card.stability).toBe(10);
      expect(card.difficulty).toBe(5);
      expect(card.reps).toBe(5);
      expect(card.state).toBe(State.Review);
    });

    it('should return initial card when FSRS fields are missing', () => {
      const progress: TopicProgress = {
        topicId: 1,
        status: 'unseen',
        confidence: 0,
        lastStudiedAt: null,
        timesStudied: 0,
        xpEarned: 0,
        nextReviewDate: null,
        userNotes: '',
        fsrsDue: null,
        fsrsStability: 0,
        fsrsDifficulty: 0,
        fsrsElapsedDays: 0,
        fsrsScheduledDays: 0,
        fsrsReps: 0,
        fsrsLapses: 0,
        fsrsState: 0,
        fsrsLastReview: null,
        wrongCount: 0,
        isNemesis: false,
      };
      const card = buildFsrsCard(progress);
      expect(card.state).toBe(State.New);
      expect(card.reps).toBe(0);
    });
  });

  describe('previewIntervals', () => {
    it('should return scheduled_days for each rating', () => {
      const card = getInitialCard();
      const intervals = previewIntervals(card);
      expect(intervals).toHaveProperty('Again');
      expect(intervals).toHaveProperty('Hard');
      expect(intervals).toHaveProperty('Good');
      expect(intervals).toHaveProperty('Easy');
      expect(typeof intervals.Again).toBe('number');
      expect(typeof intervals.Good).toBe('number');
      expect(intervals.Easy).toBeGreaterThanOrEqual(intervals.Good);
    });
  });

  describe('fsrsStatusFromCard', () => {
    it('should return "seen" for Learning state', () => {
      const card = { ...getInitialCard(), state: State.Learning };
      expect(fsrsStatusFromCard(card)).toBe('seen');
    });

    it('should return "seen" for Relearning state', () => {
      const card = { ...getInitialCard(), state: State.Relearning, stability: 0 };
      expect(fsrsStatusFromCard(card)).toBe('seen');
    });

    it('should return "reviewed" for Review state with low stability', () => {
      const card = { ...getInitialCard(), state: State.Review, stability: 5 };
      expect(fsrsStatusFromCard(card)).toBe('reviewed');
    });

    it('should return "mastered" for Review state with stability >= 21', () => {
      const card = { ...getInitialCard(), state: State.Review, stability: 21 };
      expect(fsrsStatusFromCard(card)).toBe('mastered');
    });
  });
});
