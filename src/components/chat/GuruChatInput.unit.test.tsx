import React from 'react';
import { render } from '@testing-library/react-native';
import { GuruChatInput } from './GuruChatInput';

jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
}));

describe('GuruChatInput', () => {
  it('uses a multiline composer with quick-reply chips by default', () => {
    const { getByPlaceholderText, getByText } = render(
      <GuruChatInput
        input=""
        onChangeText={jest.fn()}
        onSend={jest.fn()}
        onModelPress={jest.fn()}
        currentModelLabel="Auto"
        isLoading={false}
      />,
    );

    const input = getByPlaceholderText('Ask Guru anything...');

    expect(input.props.multiline).toBe(true);
    expect(getByText('Explain')).toBeTruthy();
    expect(getByText("Don't know")).toBeTruthy();
    expect(getByText('Quiz me')).toBeTruthy();
  });

  it('hides quick-reply chips when showQuickReplies is false', () => {
    const { queryByText } = render(
      <GuruChatInput
        input=""
        onChangeText={jest.fn()}
        onSend={jest.fn()}
        onModelPress={jest.fn()}
        currentModelLabel="Auto"
        isLoading={false}
        showQuickReplies={false}
      />,
    );

    expect(queryByText('Explain')).toBeNull();
    expect(queryByText('Quiz me')).toBeNull();
  });
});
