import React from 'react';
import { render } from '@testing-library/react-native';
import { Pressable } from 'react-native';
import { GuruChatMessageItem } from './GuruChatMessageItem';

jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
}));

jest.mock('./ChatImagePreview', () => ({
  ChatImagePreview: () => null,
}));

jest.mock('./MessageSources', () => ({
  MessageSources: () => null,
}));

const baseMessage = {
  id: 'guru-1',
  role: 'guru' as const,
  text: 'Working on it',
  timestamp: 1710000000000,
  sources: [],
  referenceImages: [],
  images: [],
  modelUsed: 'local/gemma',
};

describe('GuruChatMessageItem', () => {
  it('hides the response toolbar while the latest guru message is still loading', () => {
    const { queryByLabelText } = render(
      <GuruChatMessageItem
        message={baseMessage}
        isLatestGuruMessage
        isLoading
        isInitializing={false}
        imageJobKey={null}
        expandedSourcesMessageId={null}
        onToggleSources={jest.fn()}
        onCopyMessage={jest.fn()}
        onRegenerate={jest.fn()}
        onGenerateImage={jest.fn()}
        onOpenSource={jest.fn()}
        onSetLightboxUri={jest.fn()}
      />,
    );

    expect(queryByLabelText('Regenerate response')).toBeNull();
    expect(queryByLabelText('Copy response')).toBeNull();
  });

  it('does not wrap stable guru bubbles in an extra pressable that can flash during scroll', () => {
    const { UNSAFE_getAllByType } = render(
      <GuruChatMessageItem
        message={baseMessage}
        isLatestGuruMessage={false}
        isLoading={false}
        isInitializing={false}
        imageJobKey={null}
        expandedSourcesMessageId={null}
        onToggleSources={jest.fn()}
        onCopyMessage={jest.fn()}
        onRegenerate={jest.fn()}
        onGenerateImage={jest.fn()}
        onOpenSource={jest.fn()}
        onSetLightboxUri={jest.fn()}
      />,
    );

    expect(UNSAFE_getAllByType(Pressable)).toHaveLength(1);
  });
});
