import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import ShortcutTile from './ShortcutTile';
import * as Haptics from 'expo-haptics';

// Mock expo-haptics
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: {
    Light: 'light',
  },
}));

describe('ShortcutTile', () => {
  const defaultProps = {
    title: 'Test Shortcut',
    icon: 'book' as any,
    accent: '#FF0000',
    onPress: jest.fn(),
    accessibilityLabel: 'Test Shortcut Button',
    testID: 'shortcut-tile',
  };

  it('renders correctly with default props', () => {
    const { getByText, getByTestId, getByLabelText } = render(<ShortcutTile {...defaultProps} />);

    expect(getByText('Test Shortcut')).toBeTruthy();
    expect(getByTestId('shortcut-tile')).toBeTruthy();
    expect(getByLabelText('Test Shortcut Button')).toBeTruthy();
  });

  it('calls onPress and Haptics when pressed', () => {
    const { getByTestId } = render(<ShortcutTile {...defaultProps} />);
    const tile = getByTestId('shortcut-tile');

    fireEvent.press(tile);

    expect(defaultProps.onPress).toHaveBeenCalledTimes(1);
    expect(Haptics.impactAsync).toHaveBeenCalledWith('light');
  });

  it('renders without accessibilityLabel if not provided', () => {
    const { queryByLabelText } = render(
      <ShortcutTile {...defaultProps} accessibilityLabel={undefined} />,
    );
    // Testing library getByLabelText will fail if not found, queryByLabelText returns null
    expect(queryByLabelText('Test Shortcut Button')).toBeNull();
  });
});
