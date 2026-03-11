import type { TopicWithProgress } from '../types';
import { buildPlanBuckets, buildTopicQueues } from './studyPlannerBuckets';
import type { PlanItem } from './studyPlanner';

function makeTopic(params: {
  id: number;
  subjectId?: number;
  status?: TopicWithProgress['progress']['status'];
  confidence?: number;
  priority?: number;
}): TopicWithProgress {
  return {
    id: params.id,
    subjectId: params.subjectId ?? 1,
    parentTopicId: null,
    name: `Topic ${params.id}`,
    subtopics: [],
    estimatedMinutes: 30,
    inicetPriority: params.priority ?? 5,
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
});
