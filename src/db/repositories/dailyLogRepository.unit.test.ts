import { dailyLogRepository } from './dailyLogRepository';
import * as progressQueries from '../queries/progress';

jest.mock('../queries/progress', () => ({
  getDailyLog: jest.fn(),
  getLast30DaysLog: jest.fn(),
  getActivityHistory: jest.fn(),
  getActiveStudyDays: jest.fn(),
  getDailyMinutesSeries: jest.fn(),
  checkinToday: jest.fn(),
}));

describe('dailyLogRepository', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('delegates getDailyLog to queries', async () => {
    const mockData = { date: '2023-10-27' } as any;
    (progressQueries.getDailyLog as jest.Mock).mockResolvedValue(mockData);

    const result = await dailyLogRepository.getDailyLog('2023-10-27');

    expect(progressQueries.getDailyLog).toHaveBeenCalledWith('2023-10-27');
    expect(result).toEqual(mockData);
  });

  it('delegates getLast30DaysLog to queries', async () => {
    const mockData = [{ date: '2023-10-27' }] as any;
    (progressQueries.getLast30DaysLog as jest.Mock).mockResolvedValue(mockData);

    const result = await dailyLogRepository.getLast30DaysLog();

    expect(progressQueries.getLast30DaysLog).toHaveBeenCalled();
    expect(result).toEqual(mockData);
  });

  it('delegates getActivityHistory to queries', async () => {
    const mockData = [{ date: '2023-10-27' }] as any;
    (progressQueries.getActivityHistory as jest.Mock).mockResolvedValue(mockData);

    const result = await dailyLogRepository.getActivityHistory(15);

    expect(progressQueries.getActivityHistory).toHaveBeenCalledWith(15);
    expect(result).toEqual(mockData);
  });

  it('delegates getActiveStudyDays to queries', async () => {
    (progressQueries.getActiveStudyDays as jest.Mock).mockResolvedValue(5);

    const result = await dailyLogRepository.getActiveStudyDays(7);

    expect(progressQueries.getActiveStudyDays).toHaveBeenCalledWith(7);
    expect(result).toBe(5);
  });

  it('delegates getDailyMinutesSeries to queries', async () => {
    const mockData = [10, 20, 30];
    (progressQueries.getDailyMinutesSeries as jest.Mock).mockResolvedValue(mockData);

    const result = await dailyLogRepository.getDailyMinutesSeries(3);

    expect(progressQueries.getDailyMinutesSeries).toHaveBeenCalledWith(3);
    expect(result).toEqual(mockData);
  });

  it('delegates checkinToday to queries', async () => {
    (progressQueries.checkinToday as jest.Mock).mockResolvedValue(undefined);

    await dailyLogRepository.checkinToday('okay');

    expect(progressQueries.checkinToday).toHaveBeenCalledWith('okay');
  });
});
