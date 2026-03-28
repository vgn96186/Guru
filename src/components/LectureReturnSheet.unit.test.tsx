import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { render } from '@testing-library/react-native';
import LectureReturnSheet from './LectureReturnSheet';
import { useLecturePipeline } from '../hooks/useLecturePipeline';

jest.mock('./SubjectSelectionCard', () => ({
  __esModule: true,
  default: ({ onSelectSubject }: { onSelectSubject: (subject: string) => void }) => (
    <View>
      <Text>Subject required</Text>
      <Text>Choose the lecture subject before saving so topics get filed correctly.</Text>
      <TouchableOpacity onPress={() => onSelectSubject('Physiology')}>
        <Text>Physiology</Text>
      </TouchableOpacity>
    </View>
  ),
}));

jest.mock('../hooks/useLecturePipeline', () => ({
  useLecturePipeline: jest.fn(),
}));

const mockUseLecturePipeline = useLecturePipeline as jest.MockedFunction<typeof useLecturePipeline>;

function basePipelineReturn() {
  return {
    phase: 'intro' as const,
    analysis: null,
    setAnalysis: jest.fn(),
    errorMsg: '',
    isExpanded: false,
    setIsExpanded: jest.fn(),
    activeStage: null,
    stageMessage: '',
    stageDetail: '',
    progressPercent: 0,
    progressStep: null,
    progressTotalSteps: null,
    progressAttempt: null,
    progressMaxAttempts: null,
    progressProvider: null,
    stageStartedAt: null,
    progressHistory: [],
    transcriptionCompleted: false,
    sessionSaved: false,
    isSaving: false,
    userConfidence: null,
    setUserConfidence: jest.fn(),
    quizQuestions: [],
    quizLoading: false,
    currentQ: 0,
    selected: null,
    showExpl: false,
    score: 0,
    canTranscribe: false,
    subjectSelectionRequired: false,
    selectedSubjectName: null,
    setSelectedSubjectName: jest.fn(),
    runTranscription: jest.fn(),
    handleCancelTranscription: jest.fn(),
    handleMarkStudied: jest.fn(),
    handleMarkAndQuiz: jest.fn(),
    handleSaveAndClose: jest.fn(),
    handleSelectAnswer: jest.fn(),
    handleNextQuestion: jest.fn(),
    handleSkip: jest.fn(),
    cleanupAndClose: jest.fn(),
  };
}

const baseProps = {
  visible: true,
  appName: 'Marrow',
  durationMinutes: 47,
  recordingPath: null as string | null,
  logId: 1,
  groqKey: '',
  onDone: jest.fn(),
};

describe('LectureReturnSheet', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseLecturePipeline.mockReturnValue(basePipelineReturn());
  });

  it('renders nothing when not visible', () => {
    const { queryByText } = render(<LectureReturnSheet {...baseProps} visible={false} />);
    expect(queryByText('LECTURE PROCESSING')).toBeNull();
  });

  it('shows compact processing card when visible (intro)', () => {
    const { getByText } = render(<LectureReturnSheet {...baseProps} />);
    expect(getByText('LECTURE PROCESSING')).toBeTruthy();
    expect(getByText('Analyzing your lecture')).toBeTruthy();
  });

  it('shows a subject-required prompt in results when the detected subject is unusable', async () => {
    mockUseLecturePipeline.mockReturnValue({
      ...basePipelineReturn(),
      phase: 'results',
      isExpanded: true,
      analysis: {
        subject: 'Unknown',
        topics: ['Cardiac cycle'],
        lectureSummary: 'Lecture summary',
        keyConcepts: [],
        highYieldPoints: [],
        estimatedConfidence: 2,
      },
      subjectSelectionRequired: true,
    } as any);

    const { findByText, getByText } = render(<LectureReturnSheet {...baseProps} />);

    expect(await findByText('Subject required')).toBeTruthy();
    expect(
      getByText('Choose the lecture subject before saving so topics get filed correctly.'),
    ).toBeTruthy();
  });

  it('shows useful lecture details in the compact ready pill', () => {
    mockUseLecturePipeline.mockReturnValue({
      ...basePipelineReturn(),
      phase: 'results',
      isExpanded: false,
      analysis: {
        subject: 'Medicine',
        topics: ['ECG'],
        lectureSummary: 'Focused review of arrhythmias.',
        keyConcepts: [],
        highYieldPoints: [],
        estimatedConfidence: 3,
      },
    } as any);

    const { getByText } = render(<LectureReturnSheet {...baseProps} appName="YouTube" />);

    expect(getByText('LECTURE READY')).toBeTruthy();
    expect(getByText('Lecture summary is ready')).toBeTruthy();
    expect(getByText('Medicine • 1 topic detected')).toBeTruthy();
    expect(getByText('YOUTUBE')).toBeTruthy();
    expect(getByText('47 MIN')).toBeTruthy();
  });
});
