import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import HomeScreen from './HomeScreen';

const mockHomeNavigate = jest.fn();
const mockTabsNavigate = jest.fn();
const mockRootNavigate = jest.fn();
const mockGetFirstAsync = jest.fn();
const mockGetDailyLog = jest.fn();
const mockGetDailyAgenda = jest.fn();
const mockGetAllTopicsWithProgress = jest.fn();
const mockGetDaysToExam = jest.fn((date?: string | null) => {
  if (date === '2026-05-17') return 57;
  if (date === '2026-06-14') return 85;
  return 0;
});
const mockReloadHomeDashboard = jest.fn();
const appStoreState = {
  profile: {
    displayName: 'Vishnu Nair',
    streakCurrent: 9,
    dailyGoalMinutes: 120,
    inicetDate: '2026-05-17',
    neetDate: '2026-06-14',
    syncCode: null,
    groqApiKey: '',
    openrouterKey: '',
  },
  levelInfo: {
    level: 12,
  },
  todayPlan: {
    blocks: [
      {
        id: '1',
        title: 'Cardio revision sprint',
        topicIds: [11],
        durationMinutes: 45,
        type: 'study' as const,
        why: 'High-yield weak zone',
      },
    ],
    guruNote: 'Protect the first block.',
  },
  setTodayPlan: jest.fn(),
};
const sessionStoreState = {
  sessionId: null as number | null,
  sessionState: 'idle',
};

jest.mock('@expo/vector-icons', () => {
  const React = require('react');
  const { Text } = require('react-native');

  return {
    Ionicons: ({ name, ...props }: { name: string }) => React.createElement(Text, props, name),
  };
});

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    navigate: mockHomeNavigate,
    getParent: () => ({
      navigate: mockTabsNavigate,
      getParent: () => ({
        navigate: mockRootNavigate,
      }),
    }),
  }),
  useFocusEffect: jest.fn(),
}));

jest.mock('../store/useAppStore', () => ({
  useAppStore: () => appStoreState,
}));

jest.mock('../store/useSessionStore', () => ({
  useSessionStore: {
    getState: () => sessionStoreState,
  },
}));

jest.mock('../db/repositories', () => ({
  profileRepository: {
    getDaysToExam: (date?: string | null) => mockGetDaysToExam(date),
  },
  dailyLogRepository: {
    getDailyLog: (...args: unknown[]) => mockGetDailyLog(...args),
  },
  dailyAgendaRepository: {
    getDailyAgenda: (...args: unknown[]) => mockGetDailyAgenda(...args),
  },
}));

jest.mock('../db/database', () => ({
  getDb: () => ({
    getFirstAsync: (...args: unknown[]) => mockGetFirstAsync(...args),
  }),
}));

jest.mock('../db/queries/topics', () => ({
  getSubjectById: jest.fn(),
  getAllTopicsWithProgress: () => mockGetAllTopicsWithProgress(),
}));

jest.mock('../services/deviceSyncService', () => ({
  connectToRoom: jest.fn(() => jest.fn()),
}));

jest.mock('../services/deviceMemory', () => ({
  isLocalLlmUsable: jest.fn(() => false),
}));

jest.mock('../hooks/useLectureReturnRecovery', () => ({
  useLectureReturnRecovery: jest.fn(),
}));

jest.mock('../hooks/useHomeDashboardData', () => ({
  useHomeDashboardData: () => ({
    weakTopics: [],
    todayTasks: [],
    todayMinutes: 0,
    completedSessions: 0,
    isLoading: false,
    loadError: null,
    reload: mockReloadHomeDashboard,
  }),
}));

jest.mock('../hooks/useResponsive', () => ({
  ResponsiveContainer: ({ children, ...props }: { children: React.ReactNode }) => <>{children}</>,
}));

jest.mock('../components/LoadingOrb', () => () => null);
jest.mock('../components/LectureReturnSheet', () => () => null);
jest.mock('../components/home/QuickStatsCard', () => () => null);
jest.mock('../components/home/ShortcutTile', () => () => null);
jest.mock('../components/home/AgendaItem', () => () => null);
jest.mock('../components/home/TodayPlanCard', () => () => null);

describe('HomeScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    appStoreState.profile.displayName = 'Vishnu Nair';
    appStoreState.profile.streakCurrent = 9;
    appStoreState.profile.dailyGoalMinutes = 120;
    appStoreState.profile.inicetDate = '2026-05-17';
    appStoreState.profile.neetDate = '2026-06-14';
    appStoreState.profile.syncCode = null;
    appStoreState.profile.groqApiKey = '';
    appStoreState.profile.openrouterKey = '';
    appStoreState.levelInfo.level = 12;
    appStoreState.todayPlan = {
      blocks: [
        {
          id: '1',
          title: 'Cardio revision sprint',
          topicIds: [11],
          durationMinutes: 45,
          type: 'study',
          why: 'High-yield weak zone',
        },
      ],
      guruNote: 'Protect the first block.',
    };
    appStoreState.setTodayPlan = jest.fn();
    sessionStoreState.sessionId = null;
    sessionStoreState.sessionState = 'idle';

    mockGetDailyLog.mockResolvedValue({ mood: 'good' });
    mockGetDailyAgenda.mockResolvedValue(null);
    mockGetFirstAsync.mockResolvedValue(null);
    mockGetAllTopicsWithProgress.mockResolvedValue([
      {
        id: 42,
        parentTopicId: 7,
        subjectId: 2,
        name: 'Random Rapid Review',
      },
    ]);
  });

  it("renders the launchpad order and keeps Today's Path and Tools collapsed by default", async () => {
    const { getByText, queryByText, toJSON } = render(<HomeScreen />);

    await waitFor(() => {
      expect(getByText('INICET')).toBeTruthy();
      expect(getByText('NEET-PG')).toBeTruthy();
      expect(getByText('Start')).toBeTruthy();
      expect(getByText('Lecture Capture')).toBeTruthy();
      expect(getByText("Today's Path")).toBeTruthy();
      expect(getByText('Tools')).toBeTruthy();
    });

    const tree = JSON.stringify(toJSON());
    expect(tree.indexOf('INICET')).toBeLessThan(tree.indexOf('Start'));
    expect(tree.indexOf('Start')).toBeLessThan(tree.indexOf('Lecture Capture'));
    expect(tree.indexOf('Lecture Capture')).toBeLessThan(tree.indexOf("Today's Path"));
    expect(tree.indexOf("Today's Path")).toBeLessThan(tree.indexOf('Tools'));

    expect(queryByText('Mind maps')).toBeNull();
    expect(queryByText('Audio transcription')).toBeNull();
    expect(queryByText('MCQs')).toBeNull();
    expect(queryByText('DO THIS NOW')).toBeNull();
    expect(queryByText('QUICK ACCESS')).toBeNull();
  });

  it('uses Start as the easy anti-inertia action and keeps Lecture Capture secondary', async () => {
    const { getByText } = render(<HomeScreen />);

    await waitFor(() => {
      expect(getByText('Start')).toBeTruthy();
      expect(getByText('Lecture Capture')).toBeTruthy();
    });

    fireEvent.press(getByText('Start'));
    expect(mockHomeNavigate).toHaveBeenCalledWith('Session', { mood: 'good', mode: 'warmup' });

    fireEvent.press(getByText('Lecture Capture'));
    expect(mockHomeNavigate).toHaveBeenCalledWith('LectureMode', {});
  });

  it('resumes an active session when the sqlite session still exists', async () => {
    sessionStoreState.sessionId = 99;
    sessionStoreState.sessionState = 'active';
    mockGetFirstAsync.mockResolvedValue({ id: 99 });

    const { getByText } = render(<HomeScreen />);

    await waitFor(() => {
      expect(mockGetFirstAsync).toHaveBeenCalledWith('SELECT id FROM sessions WHERE id = ?', [99]);
    });

    fireEvent.press(getByText('Start'));

    await waitFor(() => {
      expect(mockHomeNavigate).toHaveBeenCalledWith('Session', {
        mood: 'good',
        resume: true,
      });
    });
  });

  it('queues Start until session resume validation finishes', async () => {
    sessionStoreState.sessionId = 77;
    sessionStoreState.sessionState = 'active';

    let resolveSessionCheck: ((value: { id: 77 }) => void) | null = null;
    mockGetFirstAsync.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveSessionCheck = resolve;
      }),
    );

    const { getByText } = render(<HomeScreen />);

    fireEvent.press(getByText('Start'));
    expect(mockHomeNavigate).not.toHaveBeenCalled();

    if (!resolveSessionCheck) {
      throw new Error('Expected session validator to be assigned');
    }
    const resolveSession = resolveSessionCheck as (value: { id: 77 }) => void;
    resolveSession({ id: 77 });

    await waitFor(() => {
      expect(mockHomeNavigate).toHaveBeenCalledWith('Session', {
        mood: 'good',
        resume: true,
      });
    });
  });

  it('clears stale today plan data when no agenda exists for the day', async () => {
    render(<HomeScreen />);

    await waitFor(() => {
      expect(appStoreState.setTodayPlan).toHaveBeenCalledWith(null);
    });
  });

  it('queues Start until mood hydration finishes so the correct mood is used', async () => {
    let resolveDailyLog: ((value: { mood: 'stressed' }) => void) | null = null;
    mockGetDailyLog.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveDailyLog = resolve;
      }),
    );

    const { getByText } = render(<HomeScreen />);

    fireEvent.press(getByText('Start'));
    expect(mockHomeNavigate).not.toHaveBeenCalled();

    if (!resolveDailyLog) {
      throw new Error('Expected daily log resolver to be assigned');
    }
    const resolveMood = resolveDailyLog as (value: { mood: 'stressed' }) => void;
    resolveMood({ mood: 'stressed' });

    await waitFor(() => {
      expect(mockHomeNavigate).toHaveBeenCalledWith('Session', {
        mood: 'stressed',
        mode: 'warmup',
      });
    });
  });

  it('expands Tools and reuses existing routes for the shortcut launchers', async () => {
    const { getByText } = render(<HomeScreen />);

    await waitFor(() => {
      expect(getByText('Tools')).toBeTruthy();
    });

    fireEvent.press(getByText('Tools'));

    expect(getByText('Mind maps')).toBeTruthy();
    expect(getByText('Audio transcription')).toBeTruthy();
    expect(getByText('MCQs')).toBeTruthy();
    expect(getByText('Find from clues')).toBeTruthy();
    expect(getByText('Random topic')).toBeTruthy();
    expect(getByText('Note from transcript')).toBeTruthy();

    fireEvent.press(getByText('Mind maps'));
    expect(mockTabsNavigate).toHaveBeenCalledWith('TreeTab', { screen: 'KnowledgeTree' });

    fireEvent.press(getByText('MCQs'));
    expect(mockHomeNavigate).toHaveBeenCalledWith('MockTest');

    fireEvent.press(getByText('Random topic'));
    await waitFor(() => {
      expect(mockHomeNavigate).toHaveBeenCalledWith('Session', {
        mood: 'good',
        mode: 'warmup',
        focusTopicId: 42,
      });
    });

    fireEvent.press(getByText('Note from transcript'));
    expect(mockTabsNavigate).toHaveBeenCalledWith('VaultTab', { screen: 'ManualNoteCreation' });
  });
});
