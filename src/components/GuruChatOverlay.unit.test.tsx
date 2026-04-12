import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import GuruChatOverlay from './GuruChatOverlay';
import { chatWithGuru } from '../services/aiService';

jest.mock('../services/aiService', () => ({
  chatWithGuru: jest.fn(),
}));

jest.mock('../store/useAppStore', () => ({
  useAppStore: (sel: (s: { profile: null }) => unknown) => sel({ profile: null }),
}));

jest.mock('../services/guruChatStudyContext', () => ({
  buildBoundedGuruChatStudyContext: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('./MarkdownRender', () => ({
  MarkdownRender: ({ content }: { content: string }) => {
    const { Text } = require('react-native');
    return <Text testID="md">{content}</Text>;
  },
}));

describe('GuruChatOverlay', () => {
  const onClose = jest.fn();
  const chatWithGuruMock = chatWithGuru as jest.MockedFunction<typeof chatWithGuru>;

  beforeEach(() => {
    jest.clearAllMocks();
    chatWithGuruMock.mockResolvedValue({ reply: 'Mocked guru reply' });
  });

  it('shows header and topic when visible', () => {
    const { getByText } = render(
      <GuruChatOverlay visible topicName="Cardiology — IHD" onClose={onClose} />,
    );
    expect(getByText('Study Guru')).toBeTruthy();
    expect(getByText('Cardiology — IHD')).toBeTruthy();
    expect(getByText('Ask anything about this topic')).toBeTruthy();
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

  it('passes study context when sending a question', async () => {
    const { getByPlaceholderText, getByLabelText } = render(
      <GuruChatOverlay
        visible
        topicName="Cardiology"
        contextText="Card on screen: STEMI quiz explanation and ECG changes."
        onClose={onClose}
      />,
    );

    fireEvent.changeText(getByPlaceholderText('Ask a question...'), 'Why is lead III elevated?');
    fireEvent.press(getByLabelText('Send message'));

    await waitFor(() => {
      // History excludes the current turn; chatWithGuru appends `q` internally.
      expect(chatWithGuruMock).toHaveBeenCalledWith(
        'Why is lead III elevated?',
        'Cardiology',
        [],
        undefined,
        'Card on screen: STEMI quiz explanation and ECG changes.',
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

    fireEvent.changeText(getByPlaceholderText('Ask a question...'), 'Hi');
    fireEvent.press(getByLabelText('Send message'));

    await waitFor(() => {
      expect(chatWithGuruMock).toHaveBeenCalledWith(
        'Hi',
        'Cardiology',
        [],
        undefined,
        'Syllabus topic id: 42\n\nScreen context.',
      );
    });
  });
});
