import React from 'react';
import { render } from '@testing-library/react-native';
import LectureReturnSheet from './LectureReturnSheet';
import { useLecturePipeline } from '../hooks/useLecturePipeline';

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
    expect(getByText(/Marrow/)).toBeTruthy();
  });
});
