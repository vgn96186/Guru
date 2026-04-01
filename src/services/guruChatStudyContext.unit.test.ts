jest.mock('../db/repositories', () => ({
  profileRepository: {
    getReviewDueTopics: jest.fn(),
    getWeakestTopics: jest.fn(),
    getDaysToExam: jest.fn(),
  },
}));

jest.mock('../db/database', () => ({
  getDb: () => ({
    getFirstAsync: jest.fn().mockImplementation((sql: string) => {
      if (sql.includes('FROM topics t')) {
        return Promise.resolve({
          id: 99,
          name: 'Nephrotic syndrome',
          subject_id: 5,
          subject_name: 'Medicine',
          parent_topic_id: 12,
          parent_name: 'Renal',
          status: 'seen',
          confidence: 1,
          wrong_count: 3,
          is_nemesis: 1,
          next_review_date: '2026-04-10',
        });
      }

      return Promise.resolve({
        unseen: 5,
        seen_needs_quiz: 2,
        reviewed: 4,
        mastered: 3,
        foundational_gaps: 2,
      });
    }),
    getAllAsync: jest.fn().mockResolvedValue([{ name: 'Glomerulonephritis' }]),
  }),
}));

import { profileRepository } from '../db/repositories';
import { buildBoundedGuruChatStudyContext } from './guruChatStudyContext';

describe('buildBoundedGuruChatStudyContext', () => {
  beforeEach(() => {
    jest.mocked(profileRepository.getReviewDueTopics).mockResolvedValue([
      {
        topicId: 1,
        topicName: 'Due Topic',
        subjectName: 'Anat',
        confidence: 2,
        nextReviewDate: '2025-01-01',
        daysOverdue: 0,
      },
    ]);
    jest.mocked(profileRepository.getWeakestTopics).mockResolvedValue([
      {
        id: 2,
        name: 'Weak Topic',
        subtopics: [],
        estimatedMinutes: 30,
        inicetPriority: 5,
        subjectId: 1,
        parentTopicId: null,
        subjectName: 'Phy',
        subjectCode: 'P',
        subjectColor: '#000',
        progress: {} as any,
      },
    ]);
    jest.mocked(profileRepository.getDaysToExam).mockReturnValue(90);
  });

  it('returns undefined when profile is null', async () => {
    await expect(buildBoundedGuruChatStudyContext(null)).resolves.toBeUndefined();
  });

  it('includes exam countdown and samples when INICET', async () => {
    const profile = {
      examType: 'INICET' as const,
      inicetDate: '2025-12-01',
      neetDate: '2025-11-01',
    } as any;

    const s = await buildBoundedGuruChatStudyContext(profile);
    expect(s).toContain('INI-CET');
    expect(s).toContain('90');
    expect(s).toContain('Exam intelligence');
    expect(s).toContain('Due Topic');
    expect(s).toContain('Weak Topic');
  });

  it('includes topic-specific mastery when syllabusTopicId is provided', async () => {
    const profile = {
      examType: 'INICET' as const,
      inicetDate: '2025-12-01',
      neetDate: '2025-11-01',
    } as any;

    const s = await buildBoundedGuruChatStudyContext(profile, 99);
    expect(s).toContain('Current topic: Nephrotic syndrome');
    expect(s).toContain('Topic mastery: status seen');
    expect(s).toContain('Nearby weak topics: Glomerulonephritis');
  });
});
