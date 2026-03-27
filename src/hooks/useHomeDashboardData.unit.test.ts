import { renderHook, waitFor, act } from '@testing-library/react-native';
import { InteractionManager, Alert } from 'react-native';
import { useHomeDashboardData } from './useHomeDashboardData';
import { dailyLogRepository } from '../db/repositories';
import {
  getWeakestTopics,
  getTopicsDueForReview,
  markNemesisTopics,
  getHighPriorityUnseenTopics,
} from '../db/queries/topics';
import { getCompletedSessionCount } from '../db/queries/sessions';
import { getTodaysExternalStudyMinutes } from '../db/queries/externalLogs';
import { getTodaysAgendaWithTimes } from '../services/studyPlanner';

// Mock the dependencies
jest.mock('react-native', () => ({
  Platform: {
    OS: 'android',
    select: (objs: any) => objs.android || objs.default,
  },
  Alert: {
    alert: jest.fn(),
  },
  InteractionManager: {
    runAfterInteractions: jest.fn(),
  },
}));

jest.mock('../db/repositories', () => ({
  dailyLogRepository: {
    getDailyLog: jest.fn(),
  },
}));

jest.mock('../db/queries/topics', () => ({
  getWeakestTopics: jest.fn(),
  getTopicsDueForReview: jest.fn(),
  markNemesisTopics: jest.fn(),
  getHighPriorityUnseenTopics: jest.fn(),
}));

jest.mock('../db/queries/sessions', () => ({
  getCompletedSessionCount: jest.fn(),
}));

jest.mock('../db/queries/externalLogs', () => ({
  getTodaysExternalStudyMinutes: jest.fn(),
}));

jest.mock('../services/studyPlanner', () => ({
  getTodaysAgendaWithTimes: jest.fn(),
  invalidatePlanCache: jest.fn(),
}));

describe('useHomeDashboardData', () => {
  const mockWeakTopics = [{ id: '1', title: 'Topic 1', progress: 0.5 }];
  const mockDueTopics = [{ id: '2', title: 'Topic 2', progress: 0.8 }];
  const mockTodayTasks = [{ id: '3', title: 'Task 1', startTime: '10:00' }];
  const mockCompletedSessions = 5;
  const mockDailyLog = { totalMinutes: 120 };
  const mockExternalMinutes = 35;
  let consoleSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    (markNemesisTopics as jest.Mock).mockResolvedValue(undefined);
    (getHighPriorityUnseenTopics as jest.Mock).mockResolvedValue([]);
    (getWeakestTopics as jest.Mock).mockResolvedValue(mockWeakTopics);
    (getTopicsDueForReview as jest.Mock).mockResolvedValue(mockDueTopics);
    (getTodaysAgendaWithTimes as jest.Mock).mockResolvedValue(mockTodayTasks);
    (getCompletedSessionCount as jest.Mock).mockResolvedValue(mockCompletedSessions);
    (dailyLogRepository.getDailyLog as jest.Mock).mockResolvedValue(mockDailyLog);
    (getTodaysExternalStudyMinutes as jest.Mock).mockResolvedValue(mockExternalMinutes);

    (InteractionManager.runAfterInteractions as jest.Mock).mockImplementation((cb) => {
      // Don't call cb automatically here to control it in tests if needed,
      // but for most tests we want it to run.
      // We can use a promise to ensure it runs after the hook returns the task handle.
      Promise.resolve().then(cb);
      return { cancel: jest.fn() };
    });
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it('should initialize with default state and load data on mount', async () => {
    const { result } = renderHook(() => useHomeDashboardData());

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.weakTopics).toEqual(mockWeakTopics);
    expect(result.current.dueTopics).toEqual(mockDueTopics);
    expect(result.current.todayTasks).toEqual(mockTodayTasks);
    expect(result.current.completedSessions).toBe(mockCompletedSessions);
    expect(result.current.todayMinutes).toBe(mockDailyLog.totalMinutes + mockExternalMinutes);
    expect(result.current.loadError).toBeNull();
  });

  it('should handle reload manually', async () => {
    const { result } = renderHook(() => useHomeDashboardData());

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    (getWeakestTopics as jest.Mock).mockResolvedValue([]);

    await act(async () => {
      await result.current.reload();
    });

    expect(result.current.weakTopics).toEqual([]);
    expect(result.current.isLoading).toBe(false);
  });

  it('should handle silent reload', async () => {
    const { result } = renderHook(() => useHomeDashboardData());

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // First, cause an error
    (markNemesisTopics as jest.Mock).mockRejectedValue(new Error('Reload failed'));
    await act(async () => {
      await result.current.reload();
    });
    expect(result.current.loadError).not.toBeNull();

    // Now silent reload
    (markNemesisTopics as jest.Mock).mockResolvedValue(undefined);
    await act(async () => {
      await result.current.reload({ silent: true });
    });

    expect(result.current.loadError).not.toBeNull();
    expect(result.current.weakTopics).toEqual(mockWeakTopics);
  });

  it('should handle errors during data load', async () => {
    const errorMessage = 'Database error';
    (markNemesisTopics as jest.Mock).mockRejectedValue(new Error(errorMessage));

    const { result } = renderHook(() => useHomeDashboardData());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.loadError).toBe(errorMessage);
    expect(Alert.alert).toHaveBeenCalledWith('Load Failed', errorMessage);
  });

  it('should handle silent errors (not show Alert)', async () => {
    const { result } = renderHook(() => useHomeDashboardData());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    (markNemesisTopics as jest.Mock).mockRejectedValue(new Error('Silent error'));

    await act(async () => {
      await result.current.reload({ silent: true });
    });

    expect(Alert.alert).not.toHaveBeenCalledWith('Load Failed', expect.any(String));
  });

  it('should cancel interaction on unmount', () => {
    const cancelMock = jest.fn();
    (InteractionManager.runAfterInteractions as jest.Mock).mockReturnValue({ cancel: cancelMock });

    const { unmount } = renderHook(() => useHomeDashboardData());
    unmount();

    expect(cancelMock).toHaveBeenCalled();
  });
});
