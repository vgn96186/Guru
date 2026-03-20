import type { TopicWithProgress } from '../types';
import { buildPlanBuckets, buildTopicQueues, isActionType } from './studyPlannerBuckets';
import type { PlanItem } from './studyPlanner';

function makeTopic(params: {
  id: number;
  subjectId?: number;
  status?: TopicWithProgress['progress']['status'];
  confidence?: number;
  priority?: number;
  inicetPriority?: number;
}): TopicWithProgress {
  return {
    id: params.id,
    subjectId: params.subjectId ?? 1,
    parentTopicId: null,
    name: `Topic ${params.id}`,
    subtopics: [],
    estimatedMinutes: 30,
    inicetPriority: params.inicetPriority ?? params.priority ?? 5,
    subjectName: 'Physiology',
    subjectCode: 'PHYS',
    subjectColor: '#fff',
    progress: {
      topicId: params.id,
      status: params.status ?? 'unseen',
      confidence: params.confidence ?? 0,
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
    },
  };
}

describe('studyPlannerBuckets', () => {
  describe('buildPlanBuckets', () => {
    it('builds due/weak/new buckets by mode', () => {
      const due = [makeTopic({ id: 1, status: 'reviewed', confidence: 2, priority: 6 })];
      const allTopics = [
        ...due,
        makeTopic({ id: 2, status: 'seen', confidence: 1, priority: 8 }),
        makeTopic({ id: 3, status: 'unseen', confidence: 0, priority: 9 }),
        makeTopic({ id: 4, status: 'unseen', confidence: 0, priority: 4 }),
      ];
      const subjectWeights = new Map<number, number>([[1, 8]]);

      const balanced = buildPlanBuckets({
        allTopics,
        due,
        mode: 'balanced',
        subjectWeights,
      });
      expect(balanced.weak.map(t => t.id)).toEqual([2]);
      expect(balanced.newTopics.map(t => t.id)).toEqual([3, 4]);

      const highYield = buildPlanBuckets({
        allTopics,
        due,
        mode: 'high_yield',
        subjectWeights,
      });
      expect(highYield.newTopics.map(t => t.id)).toEqual([3]);
    });

    it('filters weak topics correctly (confidence >= 3)', () => {
      const allTopics = [
        makeTopic({ id: 1, status: 'seen', confidence: 3 }), // High confidence, should be excluded
        makeTopic({ id: 2, status: 'seen', confidence: 2 }), // Low confidence, should be included
      ];
      const buckets = buildPlanBuckets({
        allTopics,
        due: [],
        mode: 'balanced',
        subjectWeights: new Map(),
      });
      expect(buckets.weak.map(t => t.id)).toEqual([2]);
    });

    it('filters weak topics correctly in high_yield mode (priority < 7)', () => {
      const allTopics = [
        makeTopic({ id: 1, status: 'seen', confidence: 1, priority: 8 }), // High priority, include
        makeTopic({ id: 2, status: 'seen', confidence: 1, priority: 6 }), // Low priority, exclude in HY
      ];
      const buckets = buildPlanBuckets({
        allTopics,
        due: [],
        mode: 'high_yield',
        subjectWeights: new Map(),
      });
      expect(buckets.weak.map(t => t.id)).toEqual([1]);
    });

    it('filters new topics correctly in exam_crunch mode (priority < 9)', () => {
      const allTopics = [
        makeTopic({ id: 1, status: 'unseen', priority: 9 }), // High priority, include
        makeTopic({ id: 2, status: 'unseen', priority: 8 }), // Low priority, exclude in EC
      ];
      const buckets = buildPlanBuckets({
        allTopics,
        due: [],
        mode: 'exam_crunch',
        subjectWeights: new Map(),
      });
      expect(buckets.newTopics.map(t => t.id)).toEqual([1]);
    });

    it('sorts new topics by weighted score', () => {
      const allTopics = [
        makeTopic({ id: 1, subjectId: 101, priority: 5 }), // (5 * 1.5) + 5 = 12.5
        makeTopic({ id: 2, subjectId: 102, priority: 9 }), // (8 * 1.5) + 9 = 21
        makeTopic({ id: 3, subjectId: 103, priority: 2 }), // (default 5 * 1.5) + 2 = 9.5
      ];
      const subjectWeights = new Map([[101, 5], [102, 8]]);
      
      const buckets = buildPlanBuckets({
        allTopics,
        due: [],
        mode: 'balanced',
        subjectWeights,
      });

      // Expected order: Topic 2 (21), Topic 1 (12.5), Topic 3 (9.5)
      expect(buckets.newTopics.map(t => t.id)).toEqual([2, 1, 3]);
    });

    it('handles empty inputs', () => {
      const buckets = buildPlanBuckets({
        allTopics: [],
        due: [],
        mode: 'balanced',
        subjectWeights: new Map(),
      });
      expect(buckets.due).toEqual([]);
      expect(buckets.weak).toEqual([]);
      expect(buckets.newTopics).toEqual([]);
    });

    it('characterize high_yield boundary: weak topics priority exactly 7', () => {
      const allTopics = [
        makeTopic({ id: 1, status: 'seen', confidence: 1, priority: 7 }),
        makeTopic({ id: 2, status: 'seen', confidence: 1, priority: 6 }),
      ];
      const buckets = buildPlanBuckets({
        allTopics,
        due: [],
        mode: 'high_yield',
        subjectWeights: new Map(),
      });
      expect(buckets.weak.map(t => t.id)).toEqual([1]);
    });

    it('characterize high_yield boundary: new topics priority exactly 8', () => {
      const allTopics = [
        makeTopic({ id: 1, status: 'unseen', priority: 8 }),
        makeTopic({ id: 2, status: 'unseen', priority: 7 }),
      ];
      const buckets = buildPlanBuckets({
        allTopics,
        due: [],
        mode: 'high_yield',
        subjectWeights: new Map(),
      });
      expect(buckets.newTopics.map(t => t.id)).toEqual([1]);
    });

    it('characterize exam_crunch boundary: new topics priority exactly 9', () => {
      const allTopics = [
        makeTopic({ id: 1, status: 'unseen', priority: 9 }),
        makeTopic({ id: 2, status: 'unseen', priority: 8 }),
      ];
      const buckets = buildPlanBuckets({
        allTopics,
        due: [],
        mode: 'exam_crunch',
        subjectWeights: new Map(),
      });
      expect(buckets.newTopics.map(t => t.id)).toEqual([1]);
    });

    it('characterize due topic overlap in balanced mode (should exclude)', () => {
      const dueTopic = makeTopic({ id: 1, status: 'reviewed', confidence: 1 });
      const buckets = buildPlanBuckets({
        allTopics: [dueTopic],
        due: [dueTopic],
        mode: 'balanced',
        subjectWeights: new Map(),
      });
      expect(buckets.due.map(t => t.id)).toEqual([1]);
      expect(buckets.weak.map(t => t.id)).toEqual([]);
    });

    it('characterize due topic overlap in high_yield mode (currently includes due topic in weak if priority >= 7)', () => {
      const dueTopic = makeTopic({ id: 1, status: 'reviewed', confidence: 1, priority: 8 });
      const buckets = buildPlanBuckets({
        allTopics: [dueTopic],
        due: [dueTopic],
        mode: 'high_yield',
        subjectWeights: new Map(),
      });
      expect(buckets.due.map(t => t.id)).toEqual([1]);
      // Current behavior: priority check is early-exit in high_yield
      expect(buckets.weak.map(t => t.id)).toEqual([1]);
    });
  });

  describe('buildTopicQueues', () => {
    it('splits pending actions into queues', () => {
      const topic = makeTopic({ id: 10 });
      const pending: PlanItem[] = [
        { id: 'a', topic, type: 'review', duration: 10, reasonLabels: [] },
        { id: 'b', topic, type: 'deep_dive', duration: 20, reasonLabels: [] },
        { id: 'c', topic, type: 'study', duration: 30, reasonLabels: [] },
      ];
      const queues = buildTopicQueues(pending);
      expect(queues.queueReviews).toHaveLength(1);
      expect(queues.queueDeep).toHaveLength(1);
      expect(queues.queueNew).toHaveLength(1);
    });

    it('handles empty actions list', () => {
      const queues = buildTopicQueues([]);
      expect(queues.queueReviews).toEqual([]);
      expect(queues.queueDeep).toEqual([]);
      expect(queues.queueNew).toEqual([]);
    });
  });

  describe('isActionType', () => {
    it('correctly identifies action types', () => {
      expect(isActionType('review', 'review')).toBe(true);
      expect(isActionType('study', 'review')).toBe(false);
    });
  });
});
