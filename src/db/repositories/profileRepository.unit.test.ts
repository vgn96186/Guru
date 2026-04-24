import { profileRepository } from './profileRepository';
import { progressRepositoryDrizzle } from './progressRepository.drizzle';
import { topicsRepositoryDrizzle } from './topicsRepository.drizzle';

jest.mock('./progressRepository.drizzle', () => ({
  progressRepositoryDrizzle: {
    getProfile: jest.fn(),
    updateProfile: jest.fn(),
    addXp: jest.fn(),
    updateStreak: jest.fn(),
    useStreakShield: jest.fn(),
    getDaysToExam: jest.fn(),
    resetStudyProgress: jest.fn(),
    clearAiCache: jest.fn(),
    getReviewDueTopics: jest.fn(),
    getRecentTopics: jest.fn(),
    applyConfidenceDecay: jest.fn(),
  },
}));

jest.mock('./topicsRepository.drizzle', () => ({
  topicsRepositoryDrizzle: {
    getSubjectCoverage: jest.fn(),
    getWeakestTopics: jest.fn(),
  },
}));

describe('profileRepository', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('delegates getProfile', async () => {
    const mockProfile = { displayName: 'Test User' } as any;
    (progressRepositoryDrizzle.getProfile as jest.Mock).mockResolvedValue(mockProfile);

    const result = await profileRepository.getProfile();

    expect(progressRepositoryDrizzle.getProfile).toHaveBeenCalled();
    expect(result).toEqual(mockProfile);
  });

  it('delegates updateProfile', async () => {
    const updates = { displayName: 'New Name' };

    await profileRepository.updateProfile(updates);

    expect(progressRepositoryDrizzle.updateProfile).toHaveBeenCalledWith(updates);
  });

  it('delegates addXp', async () => {
    await profileRepository.addXp(50);

    expect(progressRepositoryDrizzle.addXp).toHaveBeenCalledWith(50);
  });

  it('delegates updateStreak', async () => {
    await profileRepository.updateStreak(true);

    expect(progressRepositoryDrizzle.updateStreak).toHaveBeenCalledWith(true);
  });

  it('delegates useStreakShield', async () => {
    (progressRepositoryDrizzle.useStreakShield as jest.Mock).mockResolvedValue(true);

    const result = await profileRepository.useStreakShield();

    expect(progressRepositoryDrizzle.useStreakShield).toHaveBeenCalled();
    expect(result).toBe(true);
  });

  it('delegates getDaysToExam', () => {
    (progressRepositoryDrizzle.getDaysToExam as jest.Mock).mockReturnValue(10);

    const result = profileRepository.getDaysToExam('2023-11-06');

    expect(progressRepositoryDrizzle.getDaysToExam).toHaveBeenCalledWith('2023-11-06');
    expect(result).toBe(10);
  });

  it('delegates resetStudyProgress', async () => {
    await profileRepository.resetStudyProgress();

    expect(progressRepositoryDrizzle.resetStudyProgress).toHaveBeenCalled();
  });

  it('delegates clearAiCache', async () => {
    await profileRepository.clearAiCache();

    expect(progressRepositoryDrizzle.clearAiCache).toHaveBeenCalled();
  });

  it('delegates getReviewDueTopics', async () => {
    const mockTopics = [{ topicId: 1 }] as any;
    (progressRepositoryDrizzle.getReviewDueTopics as jest.Mock).mockResolvedValue(mockTopics);

    const result = await profileRepository.getReviewDueTopics();

    expect(progressRepositoryDrizzle.getReviewDueTopics).toHaveBeenCalled();
    expect(result).toEqual(mockTopics);
  });

  it('delegates getRecentTopics', async () => {
    const mockTopics = ['Topic 1'];
    (progressRepositoryDrizzle.getRecentTopics as jest.Mock).mockResolvedValue(mockTopics);

    const result = await profileRepository.getRecentTopics(5);

    expect(progressRepositoryDrizzle.getRecentTopics).toHaveBeenCalledWith(5);
    expect(result).toEqual(mockTopics);
  });

  it('delegates getSubjectCoverage', async () => {
    const mockCoverage = [{ subjectId: 1 }] as any;
    (topicsRepositoryDrizzle.getSubjectCoverage as jest.Mock).mockResolvedValue(mockCoverage);

    const result = await profileRepository.getSubjectCoverage();

    expect(topicsRepositoryDrizzle.getSubjectCoverage).toHaveBeenCalled();
    expect(result).toEqual(mockCoverage);
  });

  it('delegates getWeakestTopics', async () => {
    const mockTopics = [{ id: 1 }] as any;
    (topicsRepositoryDrizzle.getWeakestTopics as jest.Mock).mockResolvedValue(mockTopics);

    const result = await profileRepository.getWeakestTopics(3);

    expect(topicsRepositoryDrizzle.getWeakestTopics).toHaveBeenCalledWith(3);
    expect(result).toEqual(mockTopics);
  });

  it('delegates applyConfidenceDecay', async () => {
    (progressRepositoryDrizzle.applyConfidenceDecay as jest.Mock).mockResolvedValue({
      decayed: 5,
    });

    const result = await profileRepository.applyConfidenceDecay();

    expect(progressRepositoryDrizzle.applyConfidenceDecay).toHaveBeenCalled();
    expect(result).toEqual({ decayed: 5 });
  });
});
