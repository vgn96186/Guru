jest.mock('../db/repositories', () => ({
  profileRepository: {
    getReviewDueTopics: jest.fn(),
    getWeakestTopics: jest.fn(),
    getDaysToExam: jest.fn(),
  },
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
    expect(s).toContain('Due Topic');
    expect(s).toContain('Weak Topic');
  });
});
