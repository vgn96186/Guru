import React from 'react';
import { View } from 'react-native';
import { render } from '@testing-library/react-native';
import LinearButton from './LinearButton';

describe('LinearButton', () => {
  it('keeps the label centered when only a left icon is provided', () => {
    const { toJSON } = render(
      <LinearButton
        label="Watch a lecture"
        leftIcon={<View testID="left-icon" />}
        onPress={() => {}}
      />,
    );

    const tree = toJSON();
    expect(tree).not.toBeNull();
    expect(Array.isArray(tree)).toBe(false);

    const button = tree as NonNullable<typeof tree> & { children?: unknown[] };
    const contentRow = button.children?.[0] as { children?: unknown[] } | undefined;

    expect(contentRow?.children).toHaveLength(3);
  });
});
