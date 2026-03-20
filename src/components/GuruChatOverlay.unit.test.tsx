import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import GuruChatOverlay from './GuruChatOverlay';

jest.mock('../services/aiService', () => ({
  chatWithGuru: jest.fn(),
}));

jest.mock('./MarkdownRender', () => ({
  MarkdownRender: ({ content }: { content: string }) => {
    const { Text } = require('react-native');
    return <Text testID="md">{content}</Text>;
  },
}));

describe('GuruChatOverlay', () => {
  const onClose = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
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
});
