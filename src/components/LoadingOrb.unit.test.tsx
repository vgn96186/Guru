import React from 'react';
import { render } from '@testing-library/react-native';
import LoadingOrb from './LoadingOrb';

jest.mock('react-native-reanimated', () => {
  const React = require('react');
  const { View, Text } = require('react-native');

  return {
    __esModule: true,
    default: {
      View,
      Text,
      createAnimatedComponent: (Component: any) => Component,
    },
    useSharedValue: (value: any) => ({ value }),
    useAnimatedStyle: (updater: any) => updater(),
    withRepeat: (value: any) => value,
    withTiming: (toValue: any) => toValue,
    withDelay: (_delayMs: number, value: any) => value,
    Easing: {
      ease: (t: number) => t,
      inOut: (fn: (t: number) => number) => fn,
      out: (fn: (t: number) => number) => fn,
      quad: (t: number) => t * t,
    },
  };
});

describe('LoadingOrb', () => {
  it('renders correctly with default message', () => {
    const { getByText } = render(<LoadingOrb />);
    // Initial message is one of the MESSAGE_VARIATIONS
    const found = [
      'Analyzing...',
      'Deep thinking...',
      'Connecting dots...',
      'Hey there! Let me think...',
      'Crunching the concepts...',
    ].some((m) => {
      try {
        return getByText(m);
      } catch {
        return false;
      }
    });
    expect(found).toBe(true);
  });

  it('renders with custom message', () => {
    const { getByText } = render(<LoadingOrb message="Custom Loading..." />);
    expect(getByText('Custom Loading...')).toBeTruthy();
  });

  it('renders without crashing on mount', () => {
    const { getByText } = render(<LoadingOrb />);
    expect(getByText(/.+/)).toBeTruthy();
  });
});
