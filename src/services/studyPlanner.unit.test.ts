import { invalidatePlanCache, generateStudyPlan, getTodaysAgendaWithTimes } from './studyPlanner';
import {
  getAllTopicsWithProgress,
  getAllSubjects,
  getTopicsDueForReview,
} from '../db/queries/topics';
import { getPreferredStudyHours } from '../db/queries/sessions';
import { profileRepository } from '../db/repositories';
import { useAppStore } from '../store/useAppStore';

// Mock the dependencies
jest.mock('../db/queries/topics', () => ({
  getAllTopicsWithProgress: jest.fn(),
  getAllSubjects: jest.fn(),
  getTopicsDueForReview: jest.fn(),
}));

jest.mock('../db/repositories', () => ({
  profileRepository: {
    getProfile: jest.fn(),
    getDaysToExam: jest.fn(),
  },
}));

jest.mock('../db/queries/sessions', () => ({
  getPreferredStudyHours: jest.fn(),
}));

jest.mock('../store/useAppStore', () => ({
  useAppStore: {
    getState: jest.fn(),
  },
}));

describe('studyPlanner cache', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    invalidatePlanCache(); // ensure start fresh
    (useAppStore.getState as jest.Mock).mockReturnValue({ dailyAvailability: null });
  });

  it('should invalidate the plan cache', async () => {
    // Setup mocks
    (profileRepository.getProfile as jest.Mock).mockResolvedValue({
      studyResourceMode: 'hybrid',
      customSubjectLoadMultipliers: {},
      dailyGoalMinutes: 120,
      inicetDate: '2024-11-10',
      neetDate: '2024-06-23',
    });
    (profileRepository.getDaysToExam as jest.Mock).mockReturnValue(30);
    (getAllTopicsWithProgress as jest.Mock).mockResolvedValue([]);
    (getAllSubjects as jest.Mock).mockResolvedValue([]);
    (getTopicsDueForReview as jest.Mock).mockResolvedValue([]);

    // Call 1
    await generateStudyPlan();
    expect(getAllTopicsWithProgress).toHaveBeenCalledTimes(1);

    // Call 2 (should hit cache)
    await generateStudyPlan();
    expect(getAllTopicsWithProgress).toHaveBeenCalledTimes(1);

    // Invalidate
    invalidatePlanCache();

    // Call 3 (should miss cache)
    await generateStudyPlan();
    expect(getAllTopicsWithProgress).toHaveBeenCalledTimes(2);
  });

  it('recomputes when daily goal changes even without manual invalidation', async () => {
    (profileRepository.getProfile as jest.Mock)
      .mockResolvedValueOnce({
        studyResourceMode: 'hybrid',
        customSubjectLoadMultipliers: {},
        dailyGoalMinutes: 120,
        inicetDate: '2024-11-10',
        neetDate: '2024-06-23',
      })
      .mockResolvedValueOnce({
        studyResourceMode: 'hybrid',
        customSubjectLoadMultipliers: {},
        dailyGoalMinutes: 180,
        inicetDate: '2024-11-10',
        neetDate: '2024-06-23',
      });
    (profileRepository.getDaysToExam as jest.Mock).mockReturnValue(30);
    (getAllTopicsWithProgress as jest.Mock).mockResolvedValue([]);
    (getAllSubjects as jest.Mock).mockResolvedValue([]);
    (getTopicsDueForReview as jest.Mock).mockResolvedValue([]);

    await generateStudyPlan();
    await generateStudyPlan();

    expect(getAllTopicsWithProgress).toHaveBeenCalledTimes(2);
  });

  it('recomputes when exam date changes even without manual invalidation', async () => {
    (profileRepository.getProfile as jest.Mock)
      .mockResolvedValueOnce({
        studyResourceMode: 'hybrid',
        customSubjectLoadMultipliers: {},
        dailyGoalMinutes: 120,
        inicetDate: '2024-11-10',
        neetDate: '2024-06-23',
      })
      .mockResolvedValueOnce({
        studyResourceMode: 'hybrid',
        customSubjectLoadMultipliers: {},
        dailyGoalMinutes: 120,
        inicetDate: '2024-12-10',
        neetDate: '2024-06-23',
      });
    (profileRepository.getDaysToExam as jest.Mock).mockReturnValue(30);
    (getAllTopicsWithProgress as jest.Mock).mockResolvedValue([]);
    (getAllSubjects as jest.Mock).mockResolvedValue([]);
    (getTopicsDueForReview as jest.Mock).mockResolvedValue([]);

    await generateStudyPlan();
    await generateStudyPlan();

    expect(getAllTopicsWithProgress).toHaveBeenCalledTimes(2);
  });

  it('adds next-day marker to time labels when all preferred hours have passed', async () => {
    (profileRepository.getProfile as jest.Mock).mockResolvedValue({
      studyResourceMode: 'hybrid',
      customSubjectLoadMultipliers: {},
      dailyGoalMinutes: 120,
      inicetDate: '2026-05-10',
      neetDate: '2026-06-23',
    });
    (profileRepository.getDaysToExam as jest.Mock).mockReturnValue(30);
    (getAllTopicsWithProgress as jest.Mock).mockResolvedValue([]);
    (getAllSubjects as jest.Mock).mockResolvedValue([]);
    (getTopicsDueForReview as jest.Mock).mockResolvedValue([
      {
        id: 99,
        subjectId: 1,
        parentTopicId: 11,
        name: 'Renal review',
        subtopics: [],
        estimatedMinutes: 35,
        inicetPriority: 8,
        subjectName: 'Medicine',
        subjectCode: 'MED',
        subjectColor: '#fff',
        progress: {
          topicId: 99,
          status: 'reviewed',
          confidence: 2,
          lastStudiedAt: null,
          timesStudied: 1,
          xpEarned: 0,
          nextReviewDate: null,
          userNotes: '',
          fsrsDue: '2026-03-31T00:00:00.000Z',
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
      },
    ]);
    (getPreferredStudyHours as jest.Mock).mockResolvedValue([47]);

    const schedule = await getTodaysAgendaWithTimes();

    expect(schedule[0]?.timeLabel).toContain('(+1d)');
  });
});
