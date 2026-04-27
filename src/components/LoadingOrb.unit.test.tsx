import React from 'react';
import { render } from '@testing-library/react-native';
import { Platform } from 'react-native';
import LoadingOrb from './LoadingOrb';

const mockTurbulentOrb = jest.fn((props: any) => {
  const React = require('react');
  return React.createElement('TurbulentOrb', { testID: 'turbulent-orb', ...props });
});

jest.mock('./TurbulentOrb', () => ({
  __esModule: true,
  default: (props: any) => mockTurbulentOrb(props),
}));

jest.mock('../hooks/queries/useProfile', () => ({
  __esModule: true,
  useProfileQuery: () => ({ data: { loadingOrbStyle: 'turbulent' } }),
}));

jest.mock('react-native-reanimated', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: {
      View,
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
  const originalOS = Platform.OS;
  beforeEach(() => {
    mockTurbulentOrb.mockClear();
    Platform.OS = 'ios';
  });
  afterEach(() => {
    Platform.OS = originalOS;
  });

  it('renders without crashing on mount', () => {
    expect(() => render(<LoadingOrb />)).not.toThrow();
    expect(mockTurbulentOrb).toHaveBeenCalled();
  });

  it('renders with custom size', () => {
    expect(() => render(<LoadingOrb size={120} />)).not.toThrow();
    expect(mockTurbulentOrb).toHaveBeenCalled();
  });

  it('renders the turbulent orb variant when the profile is not classic', () => {
    render(<LoadingOrb message="Loading..." size={140} />);

    expect(mockTurbulentOrb).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Loading...',
        size: 140,
      }),
    );
  });
});
