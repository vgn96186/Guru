import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import GuruChatOverlay from './GuruChatOverlay';
import { useProfileQuery } from '../hooks/queries/useProfile';
import { useGuruChatSession } from '../hooks/useGuruChatSession';
import { useGuruChatModels } from '../hooks/useGuruChatModels';
import { useGuruChat } from '../hooks/useGuruChat';
import { buildBoundedGuruChatStudyContext } from '../services/guruChatStudyContext';

const sendMessageMock = jest.fn();
const setMessagesMock = jest.fn();
const setCurrentThreadMock = jest.fn();
const getOrCreateLatestGuruChatThreadMock = jest.fn(async () => ({
  id: 7,
  topicName: 'Cardiology',
}));
const getChatHistoryMock = jest.fn(async () => []);
const listGeneratedStudyImagesForTopicMock = jest.fn(async () => []);

jest.mock('./ImageLightbox', () => ({
  ImageLightbox: () => null,
}));

jest.mock('./chat/GuruChatMessageList', () => ({
  GuruChatMessageList: () => null,
}));

jest.mock('./chat/GuruChatModelSelector', () => ({
  GuruChatModelSelector: () => null,
}));

jest.mock('../hooks/queries/useProfile', () => ({
  useProfileQuery: jest.fn(() => ({ data: null })),
}));

jest.mock('../hooks/useGuruChatSession', () => ({
  useGuruChatSession: jest.fn(() => ({
    currentThread: undefined,
    setCurrentThread: setCurrentThreadMock,
    refreshThreads: jest.fn(),
    isHydratingThread: false,
    sessionSummary: '',
    sessionStateJson: '{}',
  })),
}));

jest.mock('../hooks/useGuruChatModels', () => ({
  useGuruChatModels: jest.fn(() => ({
    chosenModel: 'auto',
    pickerTab: 'recommended',
    setPickerTab: jest.fn(),
    applyChosenModel: jest.fn(),
    currentModelLabel: 'Auto',
    currentModelGroup: 'recommended',
    availableModels: [],
    visibleModelGroups: [],
  })),
}));

jest.mock('../hooks/useGuruChat', () => ({
  useGuruChat: jest.fn(() => ({
    messages: [],
    setMessages: setMessagesMock,
    status: 'ready',
    sendMessage: sendMessageMock,
  })),
}));

jest.mock('../services/guruChatStudyContext', () => ({
  buildBoundedGuruChatStudyContext: jest.fn(async (_profile: unknown, syllabusTopicId?: number) =>
    syllabusTopicId ? `Syllabus topic id: ${syllabusTopicId}` : undefined,
  ),
}));

jest.mock('../services/aiService', () => ({
  addLlmStateListener: jest.fn(() => jest.fn()),
}));

jest.mock('../services/deviceMemory', () => ({
  getLocalLlmRamWarning: jest.fn(() => null),
}));

jest.mock('../services/ai/v2', () => ({
  createGuruFallbackModel: jest.fn(),
}));

jest.mock('../db/queries/aiCache', () => ({
  getChatHistory: (...args: unknown[]) => Reflect.apply(getChatHistoryMock, null, args),
  getOrCreateLatestGuruChatThread: (...args: unknown[]) =>
    Reflect.apply(getOrCreateLatestGuruChatThreadMock, null, args),
}));

jest.mock('../db/queries/generatedStudyImages', () => ({
  listGeneratedStudyImagesForTopic: (...args: unknown[]) =>
    Reflect.apply(listGeneratedStudyImagesForTopicMock, null, args),
}));

jest.mock('../screens/guruChatLoadingState', () => ({
  shouldShowGuruChatSkeleton: jest.fn(() => false),
}));

describe('GuruChatOverlay', () => {
  const onClose = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (useProfileQuery as jest.Mock).mockReturnValue({ data: null });
    (useGuruChatSession as jest.Mock).mockReturnValue({
      currentThread: undefined,
      setCurrentThread: setCurrentThreadMock,
      refreshThreads: jest.fn(),
      isHydratingThread: false,
      sessionSummary: '',
      sessionStateJson: '{}',
    });
    (useGuruChatModels as jest.Mock).mockReturnValue({
      chosenModel: 'auto',
      pickerTab: 'recommended',
      setPickerTab: jest.fn(),
      applyChosenModel: jest.fn(),
      currentModelLabel: 'Auto',
      currentModelGroup: 'recommended',
      availableModels: [],
      visibleModelGroups: [],
    });
    (useGuruChat as jest.Mock).mockReturnValue({
      messages: [],
      setMessages: setMessagesMock,
      status: 'ready',
      sendMessage: sendMessageMock,
      stop: jest.fn(),
    });
    (buildBoundedGuruChatStudyContext as jest.Mock).mockImplementation(
      async (_profile: unknown, syllabusTopicId?: number) =>
        syllabusTopicId ? `Syllabus topic id: ${syllabusTopicId}` : undefined,
    );
    sendMessageMock.mockResolvedValue({
      id: 'assistant-1',
      role: 'guru',
      text: 'Mocked guru reply',
      timestamp: 123,
    });
    getOrCreateLatestGuruChatThreadMock.mockResolvedValue({
      id: 7,
      topicName: 'Cardiology',
    });
    getChatHistoryMock.mockResolvedValue([]);
    listGeneratedStudyImagesForTopicMock.mockResolvedValue([]);
  });

  it('shows the current header and topic when visible', () => {
    const { getByText, getByPlaceholderText } = render(
      <GuruChatOverlay visible topicName="Cardiology — IHD" onClose={onClose} />,
    );

    expect(getByText('Guru Chat')).toBeTruthy();
    expect(getByText('Cardiology — IHD')).toBeTruthy();
    expect(getByPlaceholderText('Ask Guru anything...')).toBeTruthy();
  });

  it('invokes onClose when backdrop is pressed', () => {
    const { getByLabelText } = render(
      <GuruChatOverlay visible topicName="Topic" onClose={onClose} />,
    );

    fireEvent.press(getByLabelText('Close chat'));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('invokes onClose when header close is pressed', () => {
    const { getByLabelText } = render(
      <GuruChatOverlay visible topicName="Topic" onClose={onClose} />,
    );

    fireEvent.press(getByLabelText('Close'));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('passes merged study context when sending a question', async () => {
    const { getByPlaceholderText, getByLabelText } = render(
      <GuruChatOverlay
        visible
        topicName="Cardiology"
        contextText="Card on screen: STEMI quiz explanation and ECG changes."
        onClose={onClose}
      />,
    );

    fireEvent.changeText(getByPlaceholderText('Ask Guru anything...'), 'Why is lead III elevated?');
    fireEvent.press(getByLabelText('Send message'));

    await waitFor(() => {
      expect(sendMessageMock).toHaveBeenCalledWith(
        'Why is lead III elevated?',
        expect.objectContaining({
          sessionSummary: undefined,
          sessionStateJson: '{}',
          profileNotes: undefined,
          studyContext: 'Card on screen: STEMI quiz explanation and ECG changes.',
          syllabusTopicId: undefined,
        }),
        { persistThreadId: 7 },
      );
    });
  });

  it('includes syllabus topic id in merged context when provided', async () => {
    const { getByPlaceholderText, getByLabelText } = render(
      <GuruChatOverlay
        visible
        topicName="Cardiology"
        syllabusTopicId={42}
        contextText="Screen context."
        onClose={onClose}
      />,
    );

    fireEvent.changeText(getByPlaceholderText('Ask Guru anything...'), 'Hi');
    fireEvent.press(getByLabelText('Send message'));

    await waitFor(() => {
      expect(sendMessageMock).toHaveBeenCalledWith(
        'Hi',
        expect.objectContaining({
          studyContext: 'Syllabus topic id: 42\n\nScreen context.',
          syllabusTopicId: 42,
        }),
        { persistThreadId: 7 },
      );
    });
  });
});
