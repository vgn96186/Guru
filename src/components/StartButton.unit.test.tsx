import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import * as Haptics from 'expo-haptics';
import StartButton from './StartButton';

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: {
    Light: 'light',
    Medium: 'medium',
  },
}));

// Mock Reanimated — StartButton uses useSharedValue / useAnimatedStyle / withRepeat etc.
jest.mock('react-native-reanimated', () => {
  const React = require('react');
  const { View, Text } = require('react-native');
  const withTiming = (value: any) => value;
  const withRepeat = (value: any) => value;
  const withSequence = (...values: any[]) => values[values.length - 1];
  return {
    __esModule: true,
    default: {
      View,
      Text,
      createAnimatedComponent: (C: any) => C,
    },
    useSharedValue: (init: any) => ({ value: init }),
    useAnimatedStyle: (updater: any) => {
      try {
        return updater();
      } catch {
        return {};
      }
    },
    withTiming,
    withRepeat,
    withSequence,
    withDelay: (_: number, v: any) => v,
    cancelAnimation: jest.fn(),
    Easing: {
      ease: (t: number) => t,
      sine: (t: number) => t,
      bezier: () => (t: number) => t,
      inOut: (fn: (t: number) => number) => fn,
      out: (fn: (t: number) => number) => fn,
    },
  };
});

jest.mock('react-native-svg', () => {
  const React = require('react');
  const el = (tag: string) => (props: any) => React.createElement(tag, props, props.children);
  return {
    __esModule: true,
    default: el('Svg'),
    Svg: el('Svg'),
    Defs: el('Defs'),
    RadialGradient: el('RadialGradient'),
    Stop: el('Stop'),
    Circle: el('Circle'),
    Ellipse: el('Ellipse'),
  };
});

describe('StartButton', () => {
  const onPress = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
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

  it('renders without crashing when not disabled', () => {
    expect(() => render(<StartButton onPress={onPress} />)).not.toThrow();
  });

  it('renders without crashing when disabled', () => {
    expect(() => render(<StartButton onPress={onPress} disabled />)).not.toThrow();
  });
});
