import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import { incrementWrongCount, markTopicNeedsAttention } from '../db/queries/topics';
import { setContentFlagged } from '../db/queries/aiCache';

const navigateMock = jest.fn();
const goBackMock = jest.fn();
const buildSessionMock = jest.fn();
const createSessionMock = jest.fn();

jest.mock('react-native', () => {
  const React = require('react');
  const View = ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) =>
    React.createElement('View', props, children);
  const Text = ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) =>
    React.createElement('Text', props, children);
  const ScrollView = ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) =>
    React.createElement('ScrollView', props, children);
  const TouchableOpacity = ({
    children,
    ...props
  }: React.PropsWithChildren<Record<string, unknown>>) =>
    React.createElement('TouchableOpacity', props, children);
  const StatusBar = (props: unknown) => React.createElement('StatusBar', props);
  return {
    View,
    Text,
    ScrollView,
    TouchableOpacity,
    StatusBar,
    Alert: { alert: jest.fn() },
    BackHandler: {
      addEventListener: jest.fn(() => ({ remove: jest.fn() })),
    },
    Animated: {
      View: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) =>
        React.createElement('View', props, children),
      Value: class {
        setValue = jest.fn();
        interpolate = jest.fn(() => 0);
      },
      timing: jest.fn(() => ({ start: jest.fn() })),
      delay: jest.fn(() => ({})),
      sequence: jest.fn(() => ({ start: jest.fn() })),
    },
    StyleSheet: {
      create: (styles: unknown) => styles,
    },
  };
});

const sessionStoreState: any = {
  sessionId: null,
  sessionState: 'planning',
  agenda: null,
  currentItemIndex: 0,
  currentContentIndex: 0,
  currentContent: null,
  isLoadingContent: false,
  completedTopicIds: [],
  quizResults: [],
  startedAt: null,
  activeStudyDuration: 0,
  isOnBreak: false,
  breakCountdown: 300,
  isPaused: false,
  setSessionId: jest.fn((id: number) => {
    sessionStoreState.sessionId = id;
    sessionStoreState.startedAt = 123456;
  }),
  setSessionState: jest.fn((state: string) => {
    sessionStoreState.sessionState = state;
  }),
  setAgenda: jest.fn((agenda: unknown) => {
    sessionStoreState.agenda = agenda;
  }),
  setCurrentContent: jest.fn(),
  setLoadingContent: jest.fn(),
  setPaused: jest.fn(),
  nextContent: jest.fn(),
  nextTopic: jest.fn(),
  markTopicComplete: jest.fn(),
  nextTopicNoBreak: jest.fn(),
  addQuizResult: jest.fn(),
  startBreak: jest.fn(),
  endBreak: jest.fn(),
  tickBreak: jest.fn(),
  downgradeSession: jest.fn(),
  incrementActiveStudyDuration: jest.fn(),
  resetSession: jest.fn(() => {
    sessionStoreState.sessionId = null;
    sessionStoreState.sessionState = 'planning';
    sessionStoreState.agenda = null;
  }),
};

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    navigate: navigateMock,
    goBack: goBackMock,
    getParent: jest.fn(),
    canGoBack: () => true,
  }),
  useRoute: () => ({
    params: {
      mood: 'good',
      resume: false,
    },
  }),
}));

const useSessionStoreMock: any = () => ({ ...sessionStoreState });
useSessionStoreMock.getState = () => sessionStoreState;

jest.mock('../store/useSessionStore', () => ({
  useSessionStore: useSessionStoreMock,
  getCurrentAgendaItem: jest.fn(() => null),
  getCurrentContentType: jest.fn(() => null),
}));

jest.mock('../store/useAppStore', () => ({
  useAppStore: (selector: (state: any) => unknown) =>
    selector({
      profile: {
        preferredSessionLength: 45,
        openrouterApiKey: '',
        openrouterKey: '',
        groqApiKey: '',
        bodyDoublingEnabled: false,
        guruFrequency: 'normal',
        idleTimeoutMinutes: 2,
        strictModeEnabled: false,
      },
      dailyAvailability: null,
      refreshProfile: jest.fn(),
    }),
}));

jest.mock('../services/sessionPlanner', () => ({
  buildSession: (...args: unknown[]) => buildSessionMock(...args),
}));

jest.mock('../db/queries/sessions', () => ({
  createSession: (...args: unknown[]) => createSessionMock(...args),
  endSession: jest.fn(),
}));

jest.mock('../services/aiService', () => ({
  fetchContent: jest.fn(),
  prefetchTopicContent: jest.fn(),
}));

jest.mock('../services/notificationService', () => ({
  sendImmediateNag: jest.fn(),
}));

jest.mock('../db/queries/topics', () => ({
  updateTopicProgress: jest.fn(),
  incrementWrongCount: jest.fn(),
  markTopicNeedsAttention: jest.fn(),
}));

jest.mock('../db/queries/aiCache', () => ({
  flagTopicForReview: jest.fn(),
  setContentFlagged: jest.fn(),
}));

jest.mock('../db/repositories', () => ({
  profileRepository: { updateStreak: jest.fn() },
  dailyLogRepository: { getDailyLog: jest.fn(async () => ({ sessionCount: 0 })) },
}));

jest.mock('../services/xpService', () => ({
  calculateAndAwardSessionXp: jest.fn(),
}));

jest.mock('../services/studyPlanner', () => ({
  invalidatePlanCache: jest.fn(),
}));

jest.mock('../hooks/useIdleTimer', () => ({
  useIdleTimer: () => ({ panHandlers: {} }),
}));

jest.mock('../hooks/useGuruPresence', () => ({
  useGuruPresence: () => ({
    currentMessage: null,
    presencePulse: null,
    toastOpacity: null,
    triggerEvent: jest.fn(),
  }),
}));

jest.mock('../hooks/useAppStateTransition', () => ({
  useAppStateTransition: jest.fn(),
}));

jest.mock('../components/LoadingOrb', () => 'LoadingOrb');
let latestContentCardProps: unknown;
const contentCardMock = jest.fn();
jest.mock('./ContentCard', () => (props: unknown) => {
  latestContentCardProps = props;
  contentCardMock();
  return null;
});
jest.mock(
  '../components/ErrorBoundary',
  () =>
    ({ children }: { children: React.ReactNode }) =>
      children,
);
jest.mock('./BreakScreen', () => 'BreakScreen');
jest.mock('../components/BrainDumpFab', () => 'BrainDumpFab');
jest.mock('../hooks/useResponsive', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => children,
}));

describe('SessionScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    const { BackHandler } = require('react-native');
    BackHandler.addEventListener.mockImplementation(() => ({ remove: jest.fn() }));
    sessionStoreState.sessionId = null;
    sessionStoreState.sessionState = 'planning';
    sessionStoreState.agenda = null;
    buildSessionMock.mockResolvedValue({
      items: [],
      mode: 'normal',
      focusNote: '',
    });
    createSessionMock.mockResolvedValue(101);
    sessionStoreState.currentContent = { type: 'quiz' };
    latestContentCardProps = undefined;
  });

  it('starts planning only once on initial mount', async () => {
    const SessionScreen = (await import('./SessionScreen')).default;

    render(<SessionScreen />);

    await waitFor(() => {
      expect(buildSessionMock).toHaveBeenCalledTimes(1);
    });
    expect(sessionStoreState.resetSession).toHaveBeenCalledTimes(1);
    expect(createSessionMock).toHaveBeenCalledTimes(1);
  });

  it('marks wrong quiz answers as needing attention immediately', async () => {
    const { getCurrentAgendaItem, getCurrentContentType } = jest.requireMock(
      '../store/useSessionStore',
    );
    getCurrentAgendaItem.mockReturnValue({
      topic: {
        id: 77,
        progress: { status: 'reviewed' },
      },
      contentTypes: ['quiz'],
    });
    getCurrentContentType.mockReturnValue('quiz');
    sessionStoreState.sessionState = 'studying';
    sessionStoreState.currentContent = {
      type: 'quiz',
      topicName: 'ACS',
      questions: [],
    };

    const SessionScreen = (await import('./SessionScreen')).default;
    render(<SessionScreen />);

    await waitFor(() => {
      expect(contentCardMock).toHaveBeenCalled();
    });

    const latestProps = latestContentCardProps as {
      onQuizAnswered: (correct: boolean) => void;
    };

    latestProps.onQuizAnswered(false);

    await waitFor(() => {
      expect(incrementWrongCount).toHaveBeenCalledWith(77);
      expect(markTopicNeedsAttention).toHaveBeenCalledWith(77);
      expect(setContentFlagged).toHaveBeenCalledWith(77, 'quiz', true);
    });
  });
});
