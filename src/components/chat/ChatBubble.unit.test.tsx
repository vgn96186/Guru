import React from 'react';
import { render } from '@testing-library/react-native';
import { Pressable } from 'react-native';
import { ChatBubble } from './ChatBubble';

jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
}));

jest.mock('./ChatImagePreview', () => ({
  ChatImagePreview: () => null,
}));

jest.mock('./MessageSources', () => ({
  MessageSources: () => null,
}));

jest.mock('./TypingDots', () => ({
  TypingDots: () => null,
}));

const baseMessage = {
  id: 'guru-1',
  role: 'guru' as const,
  text: '## ==Inflammation==\n\nDriven by !!C5a!!',
  timestamp: 1710000000000,
  sources: [],
  referenceImages: [],
  images: [],
  modelUsed: 'local/gemma',
};

describe('ChatBubble', () => {
  it('reuses guru formatting markers in the study-session chat path', () => {
    const { queryByText } = render(
      <ChatBubble
        type="message"
        message={baseMessage}
        isLatestGuruMessage={false}
        isTypingActive={false}
        expandedSourcesMessageId={null}
        imageJobKey={null}
        loading={false}
        copyMessage={jest.fn()}
        openSource={jest.fn()}
        setLightboxUri={jest.fn()}
        setExpandedSourcesMessageId={jest.fn()}
        handleRegenerateReply={jest.fn()}
        handleGenerateMessageImage={jest.fn()}
      />,
    );

    expect(queryByText('Inflammation')).toBeTruthy();
    expect(queryByText('C5a')).toBeTruthy();
    expect(queryByText('==Inflammation==')).toBeNull();
    expect(queryByText('!!C5a!!')).toBeNull();
  });

  it('does not wrap the study-session guru bubble in an extra pressable', () => {
    const { UNSAFE_getAllByType } = render(
      <ChatBubble
        type="message"
        message={baseMessage}
        isLatestGuruMessage={false}
        isTypingActive={false}
        expandedSourcesMessageId={null}
        imageJobKey={null}
        loading={false}
        copyMessage={jest.fn()}
        openSource={jest.fn()}
        setLightboxUri={jest.fn()}
        setExpandedSourcesMessageId={jest.fn()}
        handleRegenerateReply={jest.fn()}
        handleGenerateMessageImage={jest.fn()}
      />,
    );

    expect(UNSAFE_getAllByType(Pressable)).toHaveLength(3);
  });
});
