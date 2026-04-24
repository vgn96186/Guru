import { dailyLogRepository } from './dailyLogRepository';
import { progressRepositoryDrizzle } from './progressRepository.drizzle';

jest.mock('./progressRepository.drizzle', () => ({
  progressRepositoryDrizzle: {
    getDailyLog: jest.fn(),
    getLast30DaysLog: jest.fn(),
    getActivityHistory: jest.fn(),
    getActiveStudyDays: jest.fn(),
    getDailyMinutesSeries: jest.fn(),
    checkinToday: jest.fn(),
  },
}));

describe('dailyLogRepository', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('delegates getDailyLog to the Drizzle repository', async () => {
    const mockData = { date: '2023-10-27' } as any;
    (progressRepositoryDrizzle.getDailyLog as jest.Mock).mockResolvedValue(mockData);

    const result = await dailyLogRepository.getDailyLog('2023-10-27');

    expect(progressRepositoryDrizzle.getDailyLog).toHaveBeenCalledWith('2023-10-27');
    expect(result).toEqual(mockData);
  });

  it('delegates getLast30DaysLog to the Drizzle repository', async () => {
    const mockData = [{ date: '2023-10-27' }] as any;
    (progressRepositoryDrizzle.getLast30DaysLog as jest.Mock).mockResolvedValue(mockData);

    const result = await dailyLogRepository.getLast30DaysLog();

    expect(progressRepositoryDrizzle.getLast30DaysLog).toHaveBeenCalled();
    expect(result).toEqual(mockData);
  });

  it('delegates getActivityHistory to the Drizzle repository', async () => {
    const mockData = [{ date: '2023-10-27' }] as any;
    (progressRepositoryDrizzle.getActivityHistory as jest.Mock).mockResolvedValue(mockData);

    const result = await dailyLogRepository.getActivityHistory(15);

    expect(progressRepositoryDrizzle.getActivityHistory).toHaveBeenCalledWith(15);
    expect(result).toEqual(mockData);
  });

  it('delegates getActiveStudyDays to the Drizzle repository', async () => {
    (progressRepositoryDrizzle.getActiveStudyDays as jest.Mock).mockResolvedValue(5);

    const result = await dailyLogRepository.getActiveStudyDays(7);

    expect(progressRepositoryDrizzle.getActiveStudyDays).toHaveBeenCalledWith(7);
    expect(result).toBe(5);
  });

  it('delegates getDailyMinutesSeries to the Drizzle repository', async () => {
    const mockData = [10, 20, 30];
    (progressRepositoryDrizzle.getDailyMinutesSeries as jest.Mock).mockResolvedValue(mockData);

    const result = await dailyLogRepository.getDailyMinutesSeries(3);

    expect(progressRepositoryDrizzle.getDailyMinutesSeries).toHaveBeenCalledWith(3);
    expect(result).toEqual(mockData);
  });

  it('delegates checkinToday to the Drizzle repository', async () => {
    await dailyLogRepository.checkinToday('okay');

    expect(progressRepositoryDrizzle.checkinToday).toHaveBeenCalledWith('okay');
  });
});
