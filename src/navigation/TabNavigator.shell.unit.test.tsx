import React from 'react';
import { render } from '@testing-library/react-native';
import TabNavigator from './TabNavigator';

const tabScreens: Array<{ name: string; label?: string }> = [];
const stackScreens: Array<{ name: string }> = [];

jest.mock('@react-navigation/bottom-tabs', () => {
  const React = require('react');
  return {
    createBottomTabNavigator: jest.fn(() => ({
      Navigator: ({ children }: any) => React.createElement(React.Fragment, null, children),
      Screen: ({ name, options }: any) => {
        tabScreens.push({ name, label: options?.tabBarLabel });
        return null;
      },
    })),
  };
});

jest.mock('@react-navigation/native-stack', () => {
  const React = require('react');
  return {
    createNativeStackNavigator: jest.fn(() => ({
      Navigator: ({ children }: any) => React.createElement(React.Fragment, null, children),
      Screen: ({ name }: any) => {
        stackScreens.push({ name });
        return null;
      },
    })),
  };
});

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: jest.fn(), getParent: jest.fn() }),
  useFocusEffect: jest.fn(),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ bottom: 0, top: 0, left: 0, right: 0 }),
}));

jest.mock('../store/useAppStore', () => ({
  useAppStore: () => ({
    profile: null,
    refreshProfile: jest.fn(),
  }),
}));

jest.mock('../services/appLauncher', () => ({
  launchMedicalApp: jest.fn(),
}));

jest.mock('../services/transcriptionService', () => ({
  transcribeAudio: jest.fn(),
  generateADHDNote: jest.fn(),
}));

jest.mock('../db/database', () => ({
  getDb: () => ({
    getFirstAsync: jest.fn().mockResolvedValue({ c: 0 }),
  }),
}));

jest.mock('../db/queries/topics', () => ({
  getSubjectByName: jest.fn(),
}));

jest.mock('../db/queries/aiCache', () => ({
  saveLectureTranscript: jest.fn(),
}));

jest.mock('../screens/HomeScreen', () => () => null);
jest.mock('../screens/SessionScreen', () => () => null);
jest.mock('../screens/LectureModeScreen', () => () => null);
jest.mock('../screens/MockTestScreen', () => () => null);
jest.mock('../screens/ReviewScreen', () => () => null);
jest.mock('../screens/BossBattleScreen', () => () => null);
jest.mock('../screens/InertiaScreen', () => () => null);
jest.mock('../screens/ManualLogScreen', () => () => null);
jest.mock('../screens/DailyChallengeScreen', () => () => null);
jest.mock('../screens/FlaggedReviewScreen', () => () => null);
jest.mock('../screens/GlobalTopicSearchScreen', () => () => null);
jest.mock('../screens/SyllabusScreen', () => () => null);
jest.mock('../screens/TopicDetailScreen', () => () => null);
jest.mock('../screens/StatsScreen', () => () => null);
jest.mock('../screens/GuruChatScreen', () => () => null);
jest.mock('../screens/SettingsScreen', () => () => null);
jest.mock('../screens/NotesHubScreen', () => () => null);
jest.mock('../screens/NotesSearchScreen', () => () => null);
jest.mock('../screens/ManualNoteCreationScreen', () => () => null);
jest.mock('../screens/TranscriptHistoryScreen', () => () => null);
jest.mock('../screens/StudyPlanScreen', () => () => null);
jest.mock('../screens/DeviceLinkScreen', () => () => null);
jest.mock('../screens/MenuScreen', () => () => null);
jest.mock('../screens/CheckInScreen', () => () => null);
jest.mock('../screens/BreakEnforcerScreen', () => () => null);
jest.mock('../screens/BrainDumpReviewScreen', () => () => null);
jest.mock('../screens/SleepModeScreen', () => () => null);
jest.mock('../screens/WakeUpScreen', () => () => null);
jest.mock('../screens/BedLockScreen', () => () => null);
jest.mock('../screens/PunishmentMode', () => () => null);
jest.mock('../screens/DoomscrollInterceptor', () => () => null);
jest.mock('../screens/LockdownScreen', () => () => null);
jest.mock('../screens/DoomscrollGuideScreen', () => () => null);
jest.mock('../screens/LocalModelScreen', () => () => null);
jest.mock('../screens/PomodoroQuizScreen', () => () => null);

describe('TabNavigator shell', () => {
  beforeEach(() => {
    tabScreens.length = 0;
    stackScreens.length = 0;
  });

  it('renders the new top-level tabs', () => {
    render(<TabNavigator />);

    expect(tabScreens).toEqual([
      expect.objectContaining({ name: 'HomeTab', label: 'Home' }),
      expect.objectContaining({ name: 'TreeTab', label: 'Tree' }),
      expect.objectContaining({ name: 'VaultTab', label: 'Vault' }),
      expect.objectContaining({ name: 'StatsTab', label: 'Stats' }),
    ]);
  });
});
