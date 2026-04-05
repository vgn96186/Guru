import React from 'react';
import { render } from '@testing-library/react-native';

const mockTabNavigate = jest.fn();
const mockRootNavigate = jest.fn();

jest.mock('@react-navigation/material-top-tabs', () => {
  const React = require('react');

  return {
    createMaterialTopTabNavigator: jest.fn(() => {
      const Screen = ({ name }: { name: string }) => React.createElement('Screen', { name });
      const Navigator = ({ children, tabBar }: any) => {
        const routes = React.Children.toArray(children).map((child: any, index: number) => ({
          key: `${child.props.name}-${index}`,
          name: child.props.name,
        }));

        return React.createElement(
          'Navigator',
          {},
          tabBar?.({
            state: { index: 0, routes },
            navigation: { navigate: mockTabNavigate },
            descriptors: {},
            position: { interpolate: jest.fn() },
            jumpTo: jest.fn(),
          }),
          children,
        );
      };

      return { Navigator, Screen };
    }),
  };
});

jest.mock('@react-navigation/native-stack', () => {
  const React = require('react');

  return {
    createNativeStackNavigator: jest.fn(() => ({
      Navigator: ({ children }: any) => React.createElement('StackNavigator', {}, children),
      Screen: ({ name }: { name: string }) => React.createElement('StackScreen', { name }),
    })),
  };
});

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    navigate: mockRootNavigate,
    getParent: jest.fn(),
    canGoBack: () => true,
    goBack: jest.fn(),
  }),
  useFocusEffect: jest.fn(),
  getFocusedRouteNameFromRoute: jest.fn(() => 'MenuHome'),
}));

jest.mock('../screens/HomeScreen', () => () => null);
jest.mock('../screens/SessionScreen', () => () => null);
jest.mock('../screens/LectureModeScreen', () => () => null);
jest.mock('../screens/GuruChatScreen', () => () => null);
jest.mock('../screens/MockTestScreen', () => () => null);
jest.mock('../screens/SyllabusScreen', () => () => null);
jest.mock('../screens/TopicDetailScreen', () => () => null);
jest.mock('../screens/StatsScreen', () => () => null);
jest.mock('../screens/FlashcardsScreen', () => () => null);
jest.mock('../screens/MindMapScreen', () => () => null);
jest.mock('../screens/SettingsScreen', () => () => null);
jest.mock('../screens/ReviewScreen', () => () => null);
jest.mock('../screens/NotesHubScreen', () => () => null);
jest.mock('../screens/NotesSearchScreen', () => () => null);
jest.mock('../screens/BossBattleScreen', () => () => null);
jest.mock('../screens/InertiaScreen', () => () => null);
jest.mock('../screens/ManualLogScreen', () => () => null);
jest.mock('../screens/StudyPlanScreen', () => () => null);
jest.mock('../screens/DailyChallengeScreen', () => () => null);
jest.mock('../screens/FlaggedReviewScreen', () => () => null);
jest.mock('../screens/TranscriptHistoryScreen', () => () => null);
jest.mock('../screens/QuestionBankScreen', () => () => null);
jest.mock('../screens/MenuScreen', () => () => null);
jest.mock('../screens/GlobalTopicSearchScreen', () => () => null);
jest.mock('../screens/DeviceLinkScreen', () => () => null);
jest.mock('../screens/ManualNoteCreationScreen', () => () => null);
jest.mock('../screens/RecordingVaultScreen', () => () => null);
jest.mock('../screens/ImageVaultScreen', () => () => null);
jest.mock('../screens/NotesVaultScreen', () => () => null);
jest.mock('../screens/TranscriptVaultScreen', () => () => null);
jest.mock('../components/LectureReturnSheet', () => () => null);
jest.mock('../components/ConfidenceSelector', () => () => null);
jest.mock('../components/TopicPillRow', () => () => null);
jest.mock('../components/SubjectChip', () => () => null);
jest.mock('../components/SubjectSelectionCard', () => () => null);

jest.mock('../constants/externalApps', () => ({
  EXTERNAL_APPS: [],
}));

jest.mock('../services/appLauncher', () => ({
  launchMedicalApp: jest.fn(),
}));

jest.mock('../store/useAppStore', () => ({
  useAppStore: (selector: (state: any) => unknown) =>
    selector({
      profile: {
        groqApiKey: '',
        deepgramApiKey: '',
        huggingFaceToken: '',
        huggingFaceTranscriptionModel: '',
        useLocalWhisper: false,
        localWhisperPath: null,
        faceTrackingEnabled: false,
      },
      refreshProfile: jest.fn(),
    }),
}));

jest.mock('../config/appConfig', () => ({
  BUNDLED_GROQ_KEY: '',
  BUNDLED_HF_TOKEN: '',
}));

jest.mock('expo-document-picker', () => ({
  getDocumentAsync: jest.fn(),
}));

jest.mock('../services/transcriptionService', () => ({
  transcribeAudio: jest.fn(),
  generateADHDNote: jest.fn(),
  isMeaningfulLectureAnalysis: jest.fn(() => true),
}));

jest.mock('../services/lecture/lectureSubjectRequirement', () => ({
  resolveLectureSubjectRequirement: jest.fn(),
}));

jest.mock('../db/queries/topics', () => ({
  getSubjectByName: jest.fn(),
}));

jest.mock('../db/queries/aiCache', () => ({
  saveLectureTranscript: jest.fn(),
}));

jest.mock('../db/database', () => ({
  getDb: jest.fn(() => ({
    getFirstAsync: jest.fn(async () => ({ c: 0 })),
  })),
}));

jest.mock('../hooks/useLectureReturnRecovery', () => ({
  useLectureReturnRecovery: jest.fn(),
}));

jest.mock('./navigationRef', () => ({
  navigationRef: {
    isReady: jest.fn(() => false),
  },
}));

import TabNavigator from './TabNavigator';

describe('TabNavigator', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    const RN = require('react-native');
    const { getDb } = require('../db/database');
    RN.BackHandler = {
      addEventListener: jest.fn(() => ({ remove: jest.fn() })),
    };
    RN.PanResponder = {
      create: jest.fn(() => ({ panHandlers: {} })),
    };
    getDb.mockReturnValue({
      getFirstAsync: jest.fn(async () => ({ c: 0 })),
    });
  });

  it('disables Action Hub sheet touches when the sheet is closed', () => {
    const { root } = render(<TabNavigator />);

    const sheetNode = root.find(
      (node: any) =>
        Array.isArray(node.props?.style) &&
        node.props.style.some(
          (style: any) =>
            style?.position === 'absolute' && style?.width === '94%' && style?.maxWidth === 680,
        ),
    );

    expect(sheetNode.props.pointerEvents).toBe('none');
  });
});
