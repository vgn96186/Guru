import { invalidatePlanCache, generateStudyPlan } from './studyPlanner';
import { getAllTopicsWithProgress, getAllSubjects, getTopicsDueForReview } from '../db/queries/topics';
import { profileRepository } from '../db/repositories';

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
  });

  it('should invalidate the plan cache', async () => {
    // Setup mocks
    (profileRepository.getProfile as jest.Mock).mockResolvedValue({
      studyResourceMode: 'hybrid',
      customSubjectLoadMultipliers: {},
      dailyGoalMinutes: 120,
      inicetDate: '2024-11-10',
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
});
