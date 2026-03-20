import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { Animated } from 'react-native';
import * as Haptics from 'expo-haptics';
import StartButton from './StartButton';

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: {
    Light: 'light',
    Medium: 'medium',
  },
}));

describe('StartButton', () => {
  const onPress = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (Animated.loop as jest.Mock).mockReturnValue({
      start: jest.fn(),
      stop: jest.fn(),
      reset: jest.fn(),
    });
    (Animated.sequence as jest.Mock).mockReturnValue({
      start: jest.fn((cb) => cb && cb({ finished: true })),
      stop: jest.fn(),
      reset: jest.fn(),
    });
    (Animated.timing as jest.Mock).mockReturnValue({
      start: jest.fn((cb) => cb && cb({ finished: true })),
      stop: jest.fn(),
      reset: jest.fn(),
    });
  });

  it('renders default label', () => {
    const { getByText, getByTestId } = render(<StartButton onPress={onPress} />);
    expect(getByText('START SESSION')).toBeTruthy();
    expect(getByTestId('start-session-btn')).toBeTruthy();
  });

  it('renders custom label and sublabel', () => {
    const { getByText } = render(
      <StartButton onPress={onPress} label="GO" sublabel="Tap to begin" />,
    );
    expect(getByText('GO')).toBeTruthy();
    expect(getByText('Tap to begin')).toBeTruthy();
  });

  it('shows disabled label when disabled', () => {
    const { getByText, queryByText } = render(
      <StartButton onPress={onPress} disabled disabledLabel="PLEASE WAIT" />,
    );
    expect(getByText('PLEASE WAIT')).toBeTruthy();
    expect(queryByText('START SESSION')).toBeNull();
  });

  it('calls onPress and haptics when pressed', () => {
    const { getByTestId } = render(<StartButton onPress={onPress} />);
    fireEvent.press(getByTestId('start-session-btn'));
    expect(Haptics.impactAsync).toHaveBeenCalledWith(Haptics.ImpactFeedbackStyle.Medium);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('starts pulse animations when not disabled', () => {
    render(<StartButton onPress={onPress} />);
    expect(Animated.loop).toHaveBeenCalled();
  });

  it('does not start pulse when disabled', () => {
    (Animated.loop as jest.Mock).mockClear();
    render(<StartButton onPress={onPress} disabled />);
    expect(Animated.loop).not.toHaveBeenCalled();
  });
});
