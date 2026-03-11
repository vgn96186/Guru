import type { TopicWithProgress } from '../types';
import type { PlanActionType, PlanItem, PlanMode } from './studyPlanner';

export interface TopicQueues {
  queueReviews: PlanItem[];
  queueDeep: PlanItem[];
  queueNew: PlanItem[];
}

export interface PlanBuckets {
  due: TopicWithProgress[];
  weak: TopicWithProgress[];
  newTopics: TopicWithProgress[];
}

export function buildPlanBuckets(params: {
  allTopics: TopicWithProgress[];
  due: TopicWithProgress[];
  mode: PlanMode;
  subjectWeights: Map<number, number>;
}): PlanBuckets {
  const { allTopics, due, mode, subjectWeights } = params;
  const dueIdSet = new Set(due.map(topic => topic.id));

  const weak = allTopics.filter(topic => {
    if (topic.progress.status === 'unseen' || topic.progress.confidence >= 3) return false;
    if (mode === 'high_yield') return topic.inicetPriority >= 7;
    return !dueIdSet.has(topic.id);
  });

  const newTopics = allTopics.filter(topic => {
    if (topic.progress.status !== 'unseen') return false;
    if (mode === 'high_yield') return topic.inicetPriority >= 8;
    if (mode === 'exam_crunch') return topic.inicetPriority >= 9;
    return true;
  });

  newTopics.sort((a, b) => {
    const scoreA = (subjectWeights.get(a.subjectId) ?? 5) * 1.5 + a.inicetPriority;
    const scoreB = (subjectWeights.get(b.subjectId) ?? 5) * 1.5 + b.inicetPriority;
    return scoreB - scoreA;
  });

  return { due, weak, newTopics };
}

export function buildTopicQueues(pendingActions: PlanItem[]): TopicQueues {
  return {
    queueReviews: pendingActions.filter(item => item.type === 'review'),
    queueDeep: pendingActions.filter(item => item.type === 'deep_dive'),
    queueNew: pendingActions.filter(item => item.type === 'study'),
  };
}

export function isActionType(action: PlanActionType, expected: PlanActionType): boolean {
  return action === expected;
}
