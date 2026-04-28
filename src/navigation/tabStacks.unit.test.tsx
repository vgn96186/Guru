import React from 'react';
import { render } from '@testing-library/react-native';
import { SyllabusStackNav } from './tabStacks';

jest.mock('@react-navigation/native-stack', () => {
  const React = require('react');
  return {
    createNativeStackNavigator: jest.fn(() => ({
      Navigator: ({ children }: any) => React.createElement('Navigator', {}, children),
      Screen: ({ name, ...props }: any) => React.createElement('Screen', { name, ...props }),
    })),
  };
});

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
jest.mock('../screens/FlaggedContentScreen', () => () => null);
jest.mock('../screens/TranscriptHistoryScreen', () => () => null);
jest.mock('../screens/QuestionBankScreen', () => () => null);
jest.mock('../screens/MenuScreen', () => () => null);
jest.mock('../screens/GlobalTopicSearchScreen', () => () => null);
jest.mock('../screens/DeviceLinkScreen', () => () => null);
jest.mock('../screens/ManualNoteCreationScreen', () => () => null);
jest.mock('../screens/RecordingVaultScreen', () => () => null);
jest.mock('../screens/ImageVaultScreen', () => () => null);
jest.mock('../screens/vaults/notes/NotesVaultScreen', () => () => null);
jest.mock('../screens/TranscriptVaultScreen', () => () => null);
jest.mock('../screens/PdfViewerScreen', () => () => null);

jest.mock('../theme/linearTheme', () => ({
  linearTheme: {
    colors: { background: '#000' },
    spacing: { xl: 24 },
  },
}));

describe('SyllabusStackNav', () => {
  it('disables animation on the Syllabus screen for instant tab transitions', () => {
    const { UNSAFE_getAllByType } = render(<SyllabusStackNav />);
    const screens = UNSAFE_getAllByType('Screen') as any[];
    const syllabus = screens.find((s) => s.props?.name === 'Syllabus');
    expect(syllabus.props.options).toMatchObject({ animation: 'none' });
  });
});
