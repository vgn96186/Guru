import type { TopicWithProgress, StudyResourceMode } from '../types';
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

// Derived proportionally from the total days (137) vs average days (7.21) per subject in DBMCI
export const DBMCI_WORKLOAD_OVERRIDES: Record<string, number> = {
  ANAT: 1.94, // 14 days
  MED: 1.66, // 12 days
  SURG: 1.66, // 12 days
  OBG: 1.52, // 11 days
  PHAR: 1.38, // 10 days
  MICR: 1.25, // 9 days
  PATH: 1.11, // 8 days
  PHYS: 1.11, // 8 days
  PEDS: 0.97, // 7 days
  PSM: 0.83, // 6 days
  BIOC: 0.83, // 6 days
  OPTH: 0.83, // 6 days
  RADI: 0.83, // 6 days
  ENT: 0.69, // 5 days
  FMT: 0.55, // 4 days
  ORTH: 0.55, // 4 days
  ANES: 0.41, // 3 days
  PSY: 0.41, // 3 days
  DERM: 0.41, // 3 days
};

export const DBMCI_SUBJECT_ORDER = [
  'PATH',
  'PHYS',
  'PSM',
  'FMT',
  'ANES',
  'PEDS',
  'BIOC',
  'PSY',
  'ENT',
  'OBG',
  'OPTH',
  'DERM',
  'ANAT',
  'PHAR',
  'MED',
  'RADI',
  'MICR',
  'SURG',
  'ORTH',
];

/** Parent/container topics (e.g. "Head and Neck") should not be scheduled as study items. */
function isParentTopic(topic: TopicWithProgress): boolean {
  // DB-based check: has explicit children in common schema
  if ((topic.childCount ?? 0) > 0) return true;

  // Broad subject-level containers - fallback for unlinked data
  const broadContainerNames = [
    'Cardiology',
    'Rheumatology',
    'Neurology',
    'Gastroenterology',
    'Endocrinology',
    'Nephrology',
    'Hematology',
    'Pulmonology',
    'Infectious Diseases',
    'General Medicine',
    'General Surgery',
    'Emergency Medicine',
    'Psychiatry',
    'Pediatrics',
    'Obstetrics',
    'Gynecology',
    'Orthopedics',
    'Anesthetics',
  ];

  if (broadContainerNames.includes(topic.name)) return true;

  // Root topics that behave like containers (no parent, high minute cost)
  // are almost always container topics mistakenly marked seen in vault.
  if (!topic.parentTopicId && (topic.estimatedMinutes ?? 0) >= 45) {
    return true;
  }

  return false;
}

export function buildPlanBuckets(params: {
  allTopics: TopicWithProgress[];
  due: TopicWithProgress[];
  mode: PlanMode;
  resourceMode?: StudyResourceMode;
  subjectWeights: Map<number, number>;
}): PlanBuckets {
  const { allTopics, due, mode, resourceMode, subjectWeights } = params;
  const dueIdSet = new Set(due.map((topic) => topic.id));

  const weak = allTopics.filter((topic) => {
    if (isParentTopic(topic)) return false;
    if (topic.progress.status === 'unseen' || topic.progress.confidence >= 3) return false;
    if (mode === 'high_yield') return topic.inicetPriority >= 7;
    return !dueIdSet.has(topic.id);
  });

  const newTopics = allTopics.filter((topic) => {
    if (isParentTopic(topic)) return false;
    if (topic.progress.status !== 'unseen') return false;
    if (mode === 'high_yield') return topic.inicetPriority >= 8;
    if (mode === 'exam_crunch') return topic.inicetPriority >= 9;
    return true;
  });

  if (resourceMode === 'dbmci_live') {
    newTopics.sort((a, b) => {
      // Sort primarily by the DBMCI calendar sequence
      const idxA = DBMCI_SUBJECT_ORDER.indexOf(a.subjectCode);
      const idxB = DBMCI_SUBJECT_ORDER.indexOf(b.subjectCode);
      const orderA = idxA === -1 ? 999 : idxA;
      const orderB = idxB === -1 ? 999 : idxB;

      if (orderA !== orderB) return orderA - orderB;

      // Secondary sort: High-yield priority within the subject
      return b.inicetPriority - a.inicetPriority;
    });
  } else {
    newTopics.sort((a, b) => {
      const scoreA = (subjectWeights.get(a.subjectId) ?? 5) * 1.5 + a.inicetPriority;
      const scoreB = (subjectWeights.get(b.subjectId) ?? 5) * 1.5 + b.inicetPriority;
      return scoreB - scoreA;
    });
  }

  return { due, weak, newTopics };
}

export function buildTopicQueues(pendingActions: PlanItem[]): TopicQueues {
  return {
    queueReviews: pendingActions.filter((item) => item.type === 'review'),
    queueDeep: pendingActions.filter((item) => item.type === 'deep_dive'),
    queueNew: pendingActions.filter((item) => item.type === 'study'),
  };
}

export function isActionType(action: PlanActionType, expected: PlanActionType): boolean {
  return action === expected;
}
