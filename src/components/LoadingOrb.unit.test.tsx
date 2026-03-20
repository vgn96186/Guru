import React from 'react';
import { render } from '@testing-library/react-native';
import LoadingOrb from './LoadingOrb';
import { Animated } from 'react-native';

describe('LoadingOrb', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (Animated.loop as jest.Mock).mockReturnValue({
      start: jest.fn(),
      stop: jest.fn(),
      reset: jest.fn(),
    });
    (Animated.parallel as jest.Mock).mockReturnValue({
      start: jest.fn(),
      stop: jest.fn(),
      reset: jest.fn(),
    });
  });

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

  it('starts animation on mount', () => {
    render(<LoadingOrb />);
    expect(Animated.loop).toHaveBeenCalled();
  });
});
