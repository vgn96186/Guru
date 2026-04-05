import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import {
  approveTopicSuggestion,
  getAllSubjects,
  getPendingTopicSuggestions,
  getSubjectStatsAggregated,
  rejectTopicSuggestion,
} from '../db/queries/topics';
import { syncVaultSeedTopics } from '../db/database';
import { showDialog } from '../components/dialogService';
import { showToast } from '../components/Toast';

const capturedScreenMotionProps: Array<Record<string, unknown>> = [];
const capturedStaggeredProps: Array<Record<string, unknown>> = [];
let latestScreenMotionEntryComplete: (() => void) | undefined;

jest.mock('react-native', () => {
  const React = require('react');
  const View = ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) =>
    React.createElement('View', props, children);
  const Text = ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) =>
    React.createElement('Text', props, children);
  const TouchableOpacity = ({
    children,
    ...props
  }: React.PropsWithChildren<Record<string, unknown>>) =>
    React.createElement('TouchableOpacity', props, children);
  const ScrollView = ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) =>
    React.createElement('ScrollView', props, children);
  const ActivityIndicator = (props: Record<string, unknown>) =>
    React.createElement('ActivityIndicator', props);
  const StatusBar = (props: Record<string, unknown>) => React.createElement('StatusBar', props);
  const FlatList = ({
    data = [],
    renderItem,
    ListHeaderComponent,
    ListEmptyComponent,
    ...props
  }: Record<string, unknown>) =>
    React.createElement(
      'FlatList',
      props,
      ListHeaderComponent ?? null,
      ...(Array.isArray(data) && typeof renderItem === 'function'
        ? data.map((item, index) => renderItem({ item, index }))
        : []),
      Array.isArray(data) && data.length === 0 ? (ListEmptyComponent ?? null) : null,
    );

  return {
    View,
    Text,
    TouchableOpacity,
    ScrollView,
    ActivityIndicator,
    StatusBar,
    FlatList,
    Alert: { alert: jest.fn() },
    InteractionManager: {
      runAfterInteractions: jest.fn((callback: () => void) => {
        callback?.();
        return { cancel: jest.fn() };
      }),
    },
    StyleSheet: {
      create: (styles: unknown) => styles,
      hairlineWidth: 1,
      flatten: (style: unknown) => style,
    },
  };
});

import SyllabusScreen from './SyllabusScreen';

jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
}));

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    navigate: jest.fn(),
    push: jest.fn(),
  }),
  useIsFocused: () => true,
}));

jest.mock('../db/queries/topics', () => ({
  approveTopicSuggestion: jest.fn(),
  getAllSubjects: jest.fn(),
  getPendingTopicSuggestions: jest.fn(),
  getSubjectStatsAggregated: jest.fn(),
  rejectTopicSuggestion: jest.fn(),
}));

jest.mock('../db/database', () => ({
  getDb: jest.fn(),
  syncVaultSeedTopics: jest.fn(),
}));

jest.mock('../components/dialogService', () => ({
  showDialog: jest.fn(),
}));

jest.mock('../components/Toast', () => ({
  showToast: jest.fn(),
}));

jest.mock('../services/databaseEvents', () => ({
  DB_EVENT_KEYS: {
    PROGRESS_UPDATED: 'progress_updated',
    LECTURE_SAVED: 'lecture_saved',
  },
  dbEvents: {
    on: jest.fn(),
    off: jest.fn(),
  },
}));

jest.mock('../hooks/useResponsive', () => ({
  ResponsiveContainer: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) =>
    React.createElement('ResponsiveContainer', props, children),
}));

jest.mock('../components/ScreenHeader', () => {
  return ({ title, subtitle, searchElement, rightElement }: Record<string, unknown>) =>
    React.createElement(
      'ScreenHeader',
      { title, subtitle },
      searchElement as React.ReactNode,
      rightElement as React.ReactNode,
    );
});

jest.mock('../components/BannerIconButton', () => {
  return ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) =>
    React.createElement('BannerIconButton', props, children);
});

jest.mock('../components/BannerSearchBar', () => {
  return (props: Record<string, unknown>) => React.createElement('BannerSearchBar', props);
});

jest.mock('../components/primitives/LinearSurface', () => {
  return ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) =>
    React.createElement('LinearSurface', props, children);
});

jest.mock('../components/SubjectCard', () => {
  return ({ subject, ...props }: Record<string, unknown>) =>
    React.createElement('SubjectCard', { subjectId: (subject as { id: number }).id, ...props });
});

jest.mock('../motion/ScreenMotion', () => {
  return ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => {
    if (typeof props.isEntryComplete === 'function') {
      latestScreenMotionEntryComplete = props.isEntryComplete as () => void;
    }
    capturedScreenMotionProps.push(props);
    return React.createElement('ScreenMotion', props, children);
  };
});

jest.mock('../motion/StaggeredEntrance', () => {
  return ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => {
    capturedStaggeredProps.push(props);
    return React.createElement('StaggeredEntrance', props, children);
  };
});

jest.mock('../theme/linearTheme', () => ({
  linearTheme: {
    colors: {
      background: '#000',
      border: '#222',
      card: '#111',
      surface: '#111',
      textPrimary: '#fff',
      textSecondary: '#bbb',
      textMuted: '#999',
      accent: '#0af',
      success: '#0f0',
      warning: '#fa0',
      error: '#f00',
      borderHighlight: '#333',
      primaryTintSoft: '#223',
    },
    spacing: { md: 16, sm: 8 },
    radius: { md: 12 },
    typography: {
      title: {},
      label: {},
      caption: {},
    },
  },
}));

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  NotificationFeedbackType: { Success: 'success' },
}));

describe('SyllabusScreen motion sequencing', () => {
  beforeEach(() => {
    capturedScreenMotionProps.length = 0;
    capturedStaggeredProps.length = 0;
    latestScreenMotionEntryComplete = undefined;
    jest.clearAllMocks();

    (getAllSubjects as jest.Mock).mockResolvedValue([
      {
        id: 1,
        name: 'Anatomy',
        shortCode: 'AN',
        colorHex: '#f00',
        inicetWeight: 5,
        neetWeight: 5,
        displayOrder: 1,
      },
      {
        id: 2,
        name: 'Physiology',
        shortCode: 'PH',
        colorHex: '#0f0',
        inicetWeight: 4,
        neetWeight: 4,
        displayOrder: 2,
      },
      {
        id: 3,
        name: 'Biochemistry',
        shortCode: 'BC',
        colorHex: '#00f',
        inicetWeight: 3,
        neetWeight: 3,
        displayOrder: 3,
      },
      {
        id: 4,
        name: 'Pathology',
        shortCode: 'PA',
        colorHex: '#ff0',
        inicetWeight: 2,
        neetWeight: 2,
        displayOrder: 4,
      },
      {
        id: 5,
        name: 'Pharmacology',
        shortCode: 'PM',
        colorHex: '#0ff',
        inicetWeight: 1,
        neetWeight: 1,
        displayOrder: 5,
      },
    ]);

    (getSubjectStatsAggregated as jest.Mock).mockResolvedValue([
      { subjectId: 1, total: 10, seen: 5, due: 0, highYield: 0, unseen: 0, withNotes: 0, weak: 0 },
      { subjectId: 2, total: 10, seen: 5, due: 0, highYield: 0, unseen: 0, withNotes: 0, weak: 0 },
      { subjectId: 3, total: 10, seen: 5, due: 0, highYield: 0, unseen: 0, withNotes: 0, weak: 0 },
      { subjectId: 4, total: 10, seen: 5, due: 0, highYield: 0, unseen: 0, withNotes: 0, weak: 0 },
      { subjectId: 5, total: 10, seen: 5, due: 0, highYield: 0, unseen: 0, withNotes: 0, weak: 0 },
    ]);

    (getPendingTopicSuggestions as jest.Mock).mockResolvedValue([]);
  });

  it('uses an explicit first-mount trigger and gates section reveals on shell completion', async () => {
    render(<SyllabusScreen />);

    await waitFor(() => expect(capturedScreenMotionProps.length).toBeGreaterThan(0));
    expect(capturedScreenMotionProps[0]).toMatchObject({ trigger: 'first-mount' });

    await waitFor(() => {
      const sectionProps = new Map<number, Record<string, unknown>>();
      for (const props of capturedStaggeredProps) {
        if (typeof props.index === 'number' && props.index <= 2) {
          sectionProps.set(props.index, props);
        }
      }
      expect(Array.from(sectionProps.keys()).sort()).toEqual([0, 1, 2]);
      expect(Array.from(sectionProps.values()).every((props) => props.disabled === true)).toBe(
        true,
      );
    });

    expect(typeof latestScreenMotionEntryComplete).toBe('function');

    act(() => {
      latestScreenMotionEntryComplete?.();
    });

    await waitFor(() => {
      const sectionProps = new Map<number, Record<string, unknown>>();
      for (const props of capturedStaggeredProps) {
        if (typeof props.index === 'number' && props.index <= 2) {
          sectionProps.set(props.index, props);
        }
      }
      expect(Array.from(sectionProps.keys()).sort()).toEqual([0, 1, 2]);
      expect(Array.from(sectionProps.values()).every((props) => props.disabled === false)).toBe(
        true,
      );
    });
  });

  it('uses themed dialog for syllabus re-check confirmation and toast for success', async () => {
    (showDialog as jest.Mock).mockResolvedValue('sync');

    const { getByLabelText } = render(<SyllabusScreen />);

    await waitFor(() => {
      expect(getByLabelText('Refresh syllabus')).toBeTruthy();
    });

    fireEvent.press(getByLabelText('Refresh syllabus'));

    await waitFor(() => {
      expect(showDialog).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Re-check syllabus topics?',
        }),
      );
    });

    await waitFor(() => {
      expect(syncVaultSeedTopics).toHaveBeenCalled();
      expect(showToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Synced',
          variant: 'success',
        }),
      );
    });
  });

  it('uses themed toasts for suggestion approve and reject outcomes', async () => {
    (getPendingTopicSuggestions as jest.Mock).mockResolvedValue([
      {
        id: 101,
        name: 'Pulmonary embolism',
        subjectName: 'Medicine',
        subjectColor: '#f00',
        mentionCount: 2,
        sourceSummary: 'Repeated in lecture',
      },
    ]);
    (approveTopicSuggestion as jest.Mock).mockResolvedValue(501);
    (rejectTopicSuggestion as jest.Mock).mockResolvedValue(undefined);
    (showDialog as jest.Mock).mockResolvedValue('sync');

    const { getByLabelText, getByText } = render(<SyllabusScreen />);

    await waitFor(() => {
      expect(getByLabelText('Refresh syllabus')).toBeTruthy();
    });

    fireEvent.press(getByLabelText('Refresh syllabus'));

    await waitFor(() => {
      expect(getPendingTopicSuggestions).toHaveBeenCalled();
      expect(getByText('Lecture Topic Suggestions')).toBeTruthy();
      expect(getByText('Add to syllabus')).toBeTruthy();
    });

    fireEvent.press(getByText('Add to syllabus'));

    await waitFor(() => {
      expect(approveTopicSuggestion).toHaveBeenCalledWith(101);
      expect(showToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Topic approved',
          variant: 'success',
        }),
      );
    });

    fireEvent.press(getByText('Reject'));

    await waitFor(() => {
      expect(rejectTopicSuggestion).toHaveBeenCalledWith(101);
      expect(showToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Suggestion rejected',
          variant: 'info',
        }),
      );
    });
  });
});
