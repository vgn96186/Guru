import { profileRepository } from './profileRepository';
import * as progressQueries from '../queries/progress';
import * as topicQueries from '../queries/topics';

jest.mock('../queries/progress', () => ({
  getUserProfile: jest.fn(),
  updateUserProfile: jest.fn(),
  addXp: jest.fn(),
  updateStreak: jest.fn(),
  useStreakShield: jest.fn(),
  getDaysToExam: jest.fn(),
  resetStudyProgress: jest.fn(),
  clearAiCache: jest.fn(),
  getReviewDueTopics: jest.fn(),
  getRecentTopics: jest.fn(),
  applyConfidenceDecay: jest.fn(),
}));

jest.mock('../queries/topics', () => ({
  getSubjectCoverage: jest.fn(),
  getWeakestTopics: jest.fn(),
}));

describe('profileRepository', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('delegates getProfile to getUserProfile', async () => {
    const mockProfile = { displayName: 'Test User' } as any;
    (progressQueries.getUserProfile as jest.Mock).mockResolvedValue(mockProfile);
    
    const result = await profileRepository.getProfile();
    
    expect(progressQueries.getUserProfile).toHaveBeenCalled();
    expect(result).toEqual(mockProfile);
  });

  it('delegates updateProfile to updateUserProfile', async () => {
    const updates = { displayName: 'New Name' };
    (progressQueries.updateUserProfile as jest.Mock).mockResolvedValue(undefined);
    
    await profileRepository.updateProfile(updates);
    
    expect(progressQueries.updateUserProfile).toHaveBeenCalledWith(updates);
  });

  it('delegates addXp', async () => {
    (progressQueries.addXp as jest.Mock).mockResolvedValue({ newTotal: 100 });
    
    await profileRepository.addXp(50);
    
    expect(progressQueries.addXp).toHaveBeenCalledWith(50);
  });

  it('delegates updateStreak', async () => {
    (progressQueries.updateStreak as jest.Mock).mockResolvedValue(undefined);
    
    await profileRepository.updateStreak(true);
    
    expect(progressQueries.updateStreak).toHaveBeenCalledWith(true);
  });

  it('delegates useStreakShield', async () => {
    (progressQueries.useStreakShield as jest.Mock).mockResolvedValue(true);
    
    const result = await profileRepository.useStreakShield();
    
    expect(progressQueries.useStreakShield).toHaveBeenCalled();
    expect(result).toBe(true);
  });

  it('delegates getDaysToExam', () => {
    (progressQueries.getDaysToExam as jest.Mock).mockReturnValue(10);
    
    const result = profileRepository.getDaysToExam('2023-11-06');
    
    expect(progressQueries.getDaysToExam).toHaveBeenCalledWith('2023-11-06');
    expect(result).toBe(10);
  });

  it('delegates resetStudyProgress', async () => {
    (progressQueries.resetStudyProgress as jest.Mock).mockResolvedValue(undefined);
    
    await profileRepository.resetStudyProgress();
    
    expect(progressQueries.resetStudyProgress).toHaveBeenCalled();
  });

  it('delegates clearAiCache', async () => {
    (progressQueries.clearAiCache as jest.Mock).mockResolvedValue(undefined);
    
    await profileRepository.clearAiCache();
    
    expect(progressQueries.clearAiCache).toHaveBeenCalled();
  });

  it('delegates getReviewDueTopics', async () => {
    const mockTopics = [{ topicId: 1 }] as any;
    (progressQueries.getReviewDueTopics as jest.Mock).mockResolvedValue(mockTopics);
    
    const result = await profileRepository.getReviewDueTopics();
    
    expect(progressQueries.getReviewDueTopics).toHaveBeenCalled();
    expect(result).toEqual(mockTopics);
  });

  it('delegates getRecentTopics', async () => {
    const mockTopics = ['Topic 1'];
    (progressQueries.getRecentTopics as jest.Mock).mockResolvedValue(mockTopics);
    
    const result = await profileRepository.getRecentTopics(5);
    
    expect(progressQueries.getRecentTopics).toHaveBeenCalledWith(5);
    expect(result).toEqual(mockTopics);
  });

  it('delegates getSubjectCoverage', async () => {
    const mockCoverage = [{ subjectId: 1 }] as any;
    (topicQueries.getSubjectCoverage as jest.Mock).mockResolvedValue(mockCoverage);
    
    const result = await profileRepository.getSubjectCoverage();
    
    expect(topicQueries.getSubjectCoverage).toHaveBeenCalled();
    expect(result).toEqual(mockCoverage);
  });

  it('delegates getWeakestTopics', async () => {
    const mockTopics = [{ id: 1 }] as any;
    (topicQueries.getWeakestTopics as jest.Mock).mockResolvedValue(mockTopics);
    
    const result = await profileRepository.getWeakestTopics(3);
    
    expect(topicQueries.getWeakestTopics).toHaveBeenCalledWith(3);
    expect(result).toEqual(mockTopics);
  });

  it('delegates applyConfidenceDecay', async () => {
    (progressQueries.applyConfidenceDecay as jest.Mock).mockResolvedValue({ decayed: 5 });
    
    const result = await profileRepository.applyConfidenceDecay();
    
    expect(progressQueries.applyConfidenceDecay).toHaveBeenCalled();
    expect(result).toEqual({ decayed: 5 });
  });
});
