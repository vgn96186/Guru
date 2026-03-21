import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import KnowledgeTreeScreen from './KnowledgeTreeScreen';

const mockNavigate = jest.fn();
const mockGetAllTopicsWithProgress = jest.fn();
const mockGetTopicConnections = jest.fn();
const mockBuildTreeViewModel = jest.fn();

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    navigate: mockNavigate,
  }),
  useFocusEffect: jest.fn(),
}));

jest.mock('../db/queries/topics', () => ({
  getAllTopicsWithProgress: () => mockGetAllTopicsWithProgress(),
  getTopicConnections: () => mockGetTopicConnections(),
}));

jest.mock(
  '../services/tree/buildTreeViewModel',
  () => ({
    buildTreeViewModel: (...args: unknown[]) => mockBuildTreeViewModel(...args),
  }),
  { virtual: true },
);

jest.mock('../hooks/useResponsive', () => ({
  __esModule: true,
  useResponsive: () => ({
    s: (value: number) => value,
    f: (value: number) => value,
    sz: (value: number) => value,
    isTablet: true,
    isLandscape: true,
    maxContentWidth: 980,
  }),
  ResponsiveContainer: ({ children, style }: { children: React.ReactNode; style?: unknown }) => {
    const { View } = require('react-native');
    return <View style={style}>{children}</View>;
  },
}));

jest.mock('../components/LoadingOrb', () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock('../components/tree/MasteryLegend', () => {
  const React = require('react');
  const { Text, View } = require('react-native');
  return {
    __esModule: true,
    default: function MasteryLegendMock() {
      return React.createElement(View, null, React.createElement(Text, null, 'Mastery'));
    },
  };
});
jest.mock('../components/tree/SourceOverlayToggle', () => {
  const React = require('react');
  const { Text, View } = require('react-native');
  return {
    __esModule: true,
    default: function SourceOverlayToggleMock() {
      return React.createElement(
        View,
        null,
        React.createElement(Text, null, 'BTR'),
        React.createElement(Text, null, 'DBMCI'),
        React.createElement(Text, null, 'Marrow'),
      );
    },
  };
});
jest.mock('../components/tree/DigitalTreeCanvas', () => {
  const React = require('react');
  const { Text, View } = require('react-native');
  return {
    __esModule: true,
    default: function DigitalTreeCanvasMock({ branch }: { branch: { subjectName: string } }) {
      return React.createElement(
        View,
        null,
        React.createElement(Text, null, branch.subjectName),
        React.createElement(Text, null, 'Mock atlas canvas'),
      );
    },
  };
});

describe('KnowledgeTreeScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    mockGetAllTopicsWithProgress.mockReturnValue([
      {
        id: 101,
        subjectId: 1,
        parentTopicId: 11,
        name: 'Cardiology',
        subjectName: 'Medicine',
        subjectCode: 'MED',
        subjectColor: '#48b8ff',
        subtopics: [],
        estimatedMinutes: 30,
        inicetPriority: 9,
        progress: {
          topicId: 101,
          status: 'reviewed',
          confidence: 2,
          lastStudiedAt: null,
          timesStudied: 3,
          xpEarned: 90,
          nextReviewDate: null,
          userNotes: '',
          fsrsDue: null,
          fsrsStability: 0,
          fsrsDifficulty: 0,
          fsrsElapsedDays: 0,
          fsrsScheduledDays: 0,
          fsrsReps: 0,
          fsrsLapses: 0,
          fsrsState: 0,
          fsrsLastReview: null,
          wrongCount: 0,
          isNemesis: false,
          masteryLevel: 7,
          btrStage: 3,
          dbmciStage: 1,
          marrowAttemptedCount: 24,
          marrowCorrectCount: 18,
        },
      },
    ]);
    mockGetTopicConnections.mockReturnValue([]);

    mockBuildTreeViewModel.mockReturnValue({
      subjects: [
        {
          subjectId: 1,
          subjectName: 'Medicine',
          subjectCode: 'MED',
          subjectColor: '#48b8ff',
          roots: [
            {
              topicId: 101,
              subjectId: 1,
              parentTopicId: null,
              name: 'Cardiology',
              depth: 0,
              estimatedMinutes: 30,
              inicetPriority: 9,
              progress: {
                topicId: 101,
                status: 'reviewed',
                confidence: 2,
                lastStudiedAt: null,
                timesStudied: 3,
                xpEarned: 90,
                nextReviewDate: null,
                userNotes: '',
                fsrsDue: null,
                fsrsStability: 0,
                fsrsDifficulty: 0,
                fsrsElapsedDays: 0,
                fsrsScheduledDays: 0,
                fsrsReps: 0,
                fsrsLapses: 0,
                fsrsState: 0,
                fsrsLastReview: null,
                wrongCount: 0,
                isNemesis: false,
                masteryLevel: 7,
                btrStage: 3,
                dbmciStage: 1,
                marrowAttemptedCount: 24,
                marrowCorrectCount: 18,
              },
              badges: {
                overlay: { label: 'Mastery 7', tone: 'success' },
                source: { label: 'BTR 3', tone: 'accent' },
              },
              children: [],
            },
          ],
        },
      ],
      connections: [],
    });
  });

  it('renders the tablet tree and the source overlay controls', async () => {
    const { getByText } = render(<KnowledgeTreeScreen />);

    await waitFor(() => {
      expect(getByText('Knowledge Atlas')).toBeTruthy();
      expect(getByText('Subject Constellations')).toBeTruthy();
      expect(getByText('Mastery')).toBeTruthy();
      expect(getByText('BTR')).toBeTruthy();
      expect(getByText('DBMCI')).toBeTruthy();
      expect(getByText('Marrow')).toBeTruthy();
      expect(getByText('Selected Subject')).toBeTruthy();
      expect(getByText('Medicine')).toBeTruthy();
      expect(getByText('Cardiology')).toBeTruthy();
    });
  });

  it('opens topic detail when a topic node is pressed', async () => {
    const { getByLabelText } = render(<KnowledgeTreeScreen />);

    await waitFor(() => {
      expect(getByLabelText(/open cardiology topic/i)).toBeTruthy();
    });

    fireEvent.press(getByLabelText(/open cardiology topic/i));

    expect(mockNavigate).toHaveBeenCalledWith('TopicDetail', {
      subjectId: 1,
      subjectName: 'Medicine',
      initialTopicId: 101,
    });
  });
});
