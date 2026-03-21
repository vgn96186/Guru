import type { TopicConnection, TopicWithProgress } from '../../types';
import { buildTreeViewModel } from './buildTreeViewModel';

function makeTopic(
  topicId: number,
  subjectId: number,
  name: string,
  parentTopicId: number | null,
  inicetPriority: number,
  overrides: Partial<TopicWithProgress['progress']> = {},
): TopicWithProgress {
  return {
    id: topicId,
    subjectId,
    parentTopicId,
    name,
    subtopics: [],
    estimatedMinutes: 35,
    inicetPriority,
    subjectName: subjectId === 1 ? 'Anatomy' : 'Physiology',
    subjectCode: subjectId === 1 ? 'ANAT' : 'PHYS',
    subjectColor: subjectId === 1 ? '#AA0000' : '#00AA00',
    progress: {
      topicId,
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
      masteryLevel: 0,
      btrStage: 0,
      dbmciStage: 0,
      marrowAttemptedCount: 0,
      marrowCorrectCount: 0,
      ...overrides,
    },
  };
}

describe('buildTreeViewModel', () => {
  it('groups descendants under stable subject roots and computes badges', () => {
    const model = buildTreeViewModel({
      topics: [
        makeTopic(10, 1, 'Thorax', null, 9, {
          masteryLevel: 3,
          marrowAttemptedCount: 10,
          marrowCorrectCount: 8,
        }),
        makeTopic(11, 1, 'Heart', 10, 7, {
          masteryLevel: 1,
          btrStage: 2,
          marrowAttemptedCount: 4,
          marrowCorrectCount: 2,
        }),
        makeTopic(12, 1, 'Aorta', 11, 6, {
          dbmciStage: 4,
        }),
        makeTopic(13, 1, 'Abdomen', null, 8),
        makeTopic(20, 2, 'Cardiac Output', null, 10, {
          masteryLevel: 2,
          btrStage: 1,
        }),
      ],
    });

    expect(model).toEqual({
      subjects: [
        {
          subjectId: 1,
          subjectName: 'Anatomy',
          subjectCode: 'ANAT',
          subjectColor: '#AA0000',
          roots: [
            {
              topicId: 10,
              subjectId: 1,
              parentTopicId: null,
              name: 'Thorax',
              depth: 0,
              estimatedMinutes: 35,
              inicetPriority: 9,
              progress: expect.objectContaining({
                masteryLevel: 3,
                marrowAttemptedCount: 10,
                marrowCorrectCount: 8,
              }),
              badges: {
                overlay: { label: 'Mastery 3', tone: 'success' },
                source: { label: 'Marrow 8/10', tone: 'success' },
              },
              children: [
                {
                  topicId: 11,
                  subjectId: 1,
                  parentTopicId: 10,
                  name: 'Heart',
                  depth: 1,
                  estimatedMinutes: 35,
                  inicetPriority: 7,
                  progress: expect.objectContaining({
                    masteryLevel: 1,
                    btrStage: 2,
                  }),
                  badges: {
                    overlay: { label: 'Mastery 1', tone: 'warning' },
                    source: { label: 'BTR 2', tone: 'accent' },
                  },
                  children: [
                    {
                      topicId: 12,
                      subjectId: 1,
                      parentTopicId: 11,
                      name: 'Aorta',
                      depth: 2,
                      estimatedMinutes: 35,
                      inicetPriority: 6,
                      progress: expect.objectContaining({
                        dbmciStage: 4,
                      }),
                      badges: {
                        overlay: null,
                        source: { label: 'DBMCI 4', tone: 'accent' },
                      },
                      children: [],
                    },
                  ],
                },
              ],
            },
            {
              topicId: 13,
              subjectId: 1,
              parentTopicId: null,
              name: 'Abdomen',
              depth: 0,
              estimatedMinutes: 35,
              inicetPriority: 8,
              progress: expect.objectContaining({
                masteryLevel: 0,
              }),
              badges: {
                overlay: null,
                source: null,
              },
              children: [],
            },
          ],
        },
        {
          subjectId: 2,
          subjectName: 'Physiology',
          subjectCode: 'PHYS',
          subjectColor: '#00AA00',
          roots: [
            {
              topicId: 20,
              subjectId: 2,
              parentTopicId: null,
              name: 'Cardiac Output',
              depth: 0,
              estimatedMinutes: 35,
              inicetPriority: 10,
              progress: expect.objectContaining({
                masteryLevel: 2,
                btrStage: 1,
              }),
              badges: {
                overlay: { label: 'Mastery 2', tone: 'accent' },
                source: { label: 'BTR 1', tone: 'accent' },
              },
              children: [],
            },
          ],
        },
      ],
      connections: [],
    });
  });

  it('keeps cross-topic connections separate from the branch tree', () => {
    const connections: TopicConnection[] = [
      {
        id: 99,
        fromTopicId: 12,
        toTopicId: 20,
        relationType: 'cross_topic',
        label: 'applies to',
      },
    ];

    const model = buildTreeViewModel({
      topics: [makeTopic(10, 1, 'Thorax', null, 9), makeTopic(20, 2, 'Cardiac Output', null, 10)],
      connections,
    });

    expect(model.connections).toEqual([
      {
        id: 99,
        fromTopicId: 12,
        toTopicId: 20,
        relationType: 'cross_topic',
        label: 'applies to',
      },
    ]);
  });
});
