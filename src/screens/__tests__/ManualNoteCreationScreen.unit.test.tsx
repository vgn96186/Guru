import React from 'react';
import { Alert, Text, TouchableOpacity, View } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import ManualNoteCreationScreen from '../ManualNoteCreationScreen';
import type { MenuStackParamList } from '../../navigation/types';

const mockAnalyzeTranscript = jest.fn();
const mockGenerateADHDNote = jest.fn();
const mockIsMeaningfulLectureAnalysis = jest.fn();
const mockGetSubjectByName = jest.fn();
const mockGetAllSubjects = jest.fn();
const mockSaveLectureTranscript = jest.fn();
const mockMarkTopicsFromLecture = jest.fn();
const mockGoBack = jest.fn();

jest.mock('../../services/transcriptionService', () => ({
  analyzeTranscript: (...args: unknown[]) => mockAnalyzeTranscript(...args),
  generateADHDNote: (...args: unknown[]) => mockGenerateADHDNote(...args),
  isMeaningfulLectureAnalysis: (...args: unknown[]) => mockIsMeaningfulLectureAnalysis(...args),
}));

jest.mock('../../db/queries/topics', () => ({
  getSubjectByName: (...args: unknown[]) => mockGetSubjectByName(...args),
  getAllSubjects: (...args: unknown[]) => mockGetAllSubjects(...args),
}));

jest.mock('../../components/SubjectSelectionCard', () => ({
  __esModule: true,
  default: ({ onSelectSubject }: { onSelectSubject: (subject: string) => void }) => {
    const { View, Text, TouchableOpacity } = require('react-native');
    return (
      <View>
        <Text>Subject required</Text>
        <Text>Choose the lecture subject before saving so topics get filed correctly.</Text>
        <Text>Detected: Unknown</Text>
        <TouchableOpacity onPress={() => onSelectSubject('Physiology')}>
          <Text>Physiology</Text>
        </TouchableOpacity>
      </View>
    );
  },
}));

jest.mock('../../db/queries/aiCache', () => ({
  saveLectureTranscript: (...args: unknown[]) => mockSaveLectureTranscript(...args),
}));

jest.mock('../../services/transcription/matching', () => ({
  markTopicsFromLecture: (...args: unknown[]) => mockMarkTopicsFromLecture(...args),
}));

jest.mock('../../db/database', () => ({
  getDb: jest.fn(() => ({ mocked: true })),
}));

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    goBack: mockGoBack,
    canGoBack: () => true,
    getParent: jest.fn(() => ({
      navigate: jest.fn(),
    })),
  }),
  useFocusEffect: (effect: () => void | (() => void)) => {
    effect();
  },
}));

describe('ManualNoteCreationScreen', () => {
  const baseProps = {
    navigation: {} as any,
    route: {
      key: 'ManualNoteCreation-test',
      name: 'ManualNoteCreation',
      params: undefined,
    } as any,
  } satisfies {
    navigation: any;
    route: { key: string; name: keyof MenuStackParamList; params: undefined };
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, 'alert').mockImplementation(jest.fn());
    mockAnalyzeTranscript.mockResolvedValue({
      subject: 'Medicine',
      topics: ['Heart failure'],
      keyConcepts: [],
      highYieldPoints: [],
      lectureSummary: 'Lecture content recorded. Review transcript for details.',
      estimatedConfidence: 1,
    });
    mockGenerateADHDNote.mockResolvedValue('Generated note');
    mockIsMeaningfulLectureAnalysis.mockReturnValue(true);
    mockGetSubjectByName.mockResolvedValue({ id: 7 });
    mockGetAllSubjects.mockResolvedValue([
      {
        id: 7,
        name: 'Medicine',
        shortCode: 'MED',
        colorHex: '#fff',
        inicetWeight: 1,
        neetWeight: 1,
        displayOrder: 1,
      },
      {
        id: 8,
        name: 'Physiology',
        shortCode: 'PHYS',
        colorHex: '#fff',
        inicetWeight: 1,
        neetWeight: 1,
        displayOrder: 2,
      },
    ]);
    mockSaveLectureTranscript.mockResolvedValue(undefined);
    mockMarkTopicsFromLecture.mockResolvedValue(undefined);
  });

  it('blocks generic failed analysis from being turned into notes', async () => {
    mockIsMeaningfulLectureAnalysis.mockReturnValue(false);
    const { getByPlaceholderText, getByText } = render(<ManualNoteCreationScreen {...baseProps} />);

    fireEvent.changeText(getByPlaceholderText('Paste transcript here...'), 'some pasted text');
    fireEvent.press(getByText('Generate Notes'));

    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith(
        'Something went wrong',
        'No usable lecture content was detected in this transcript.',
        expect.any(Array),
        expect.objectContaining({ cancelable: true }),
      );
    });

    expect(mockGenerateADHDNote).not.toHaveBeenCalled();
  });

  it('saves a meaningful pasted transcript after review', async () => {
    const { getByPlaceholderText, getByText } = render(<ManualNoteCreationScreen {...baseProps} />);

    fireEvent.changeText(getByPlaceholderText('Paste transcript here...'), 'useful pasted text');
    fireEvent.press(getByText('Generate Notes'));

    await waitFor(() => {
      expect(getByText('Review Notes')).toBeTruthy();
    });

    fireEvent.press(getByText('Save to Notes Vault'));

    await waitFor(() => {
      expect(mockSaveLectureTranscript).toHaveBeenCalled();
    });
  });

  it('requires the user to choose a subject before saving when detection fails', async () => {
    mockAnalyzeTranscript.mockResolvedValueOnce({
      subject: 'Unknown',
      topics: ['Heart failure'],
      keyConcepts: [],
      highYieldPoints: [],
      lectureSummary: 'Useful summary',
      estimatedConfidence: 2,
    });
    mockGetSubjectByName.mockResolvedValueOnce({ id: 8, name: 'Physiology' });

    const { getByPlaceholderText, getByText, findByText } = render(
      <ManualNoteCreationScreen {...baseProps} />,
    );

    fireEvent.changeText(getByPlaceholderText('Paste transcript here...'), 'useful pasted text');
    fireEvent.press(getByText('Generate Notes'));

    expect(await findByText('Subject required')).toBeTruthy();
    fireEvent.press(getByText('Save to Notes Vault'));
    expect(mockSaveLectureTranscript).not.toHaveBeenCalled();

    fireEvent.press(getByText('Physiology'));
    fireEvent.press(getByText('Save to Notes Vault'));

    await waitFor(() => {
      expect(mockSaveLectureTranscript).toHaveBeenCalledWith(
        expect.objectContaining({
          subjectId: 8,
          subjectName: 'Physiology',
        }),
      );
    });
  });
});
