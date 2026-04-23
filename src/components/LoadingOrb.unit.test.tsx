import React from 'react';
import { render } from '@testing-library/react-native';
import LoadingOrb from './LoadingOrb';

const turbulentOrbMock = jest.fn((props: any) =>
  React.createElement('TurbulentOrb', { testID: 'turbulent-orb', ...props }),
);

jest.mock('./TurbulentOrb', () => ({
  __esModule: true,
  default: (props: any) => turbulentOrbMock(props),
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
  beforeEach(() => {
    turbulentOrbMock.mockClear();
  });

  it('renders without crashing on mount', () => {
    expect(() => render(<LoadingOrb />)).not.toThrow();
    expect(turbulentOrbMock).toHaveBeenCalled();
  });

  it('renders with custom size', () => {
    expect(() => render(<LoadingOrb size={120} />)).not.toThrow();
    expect(turbulentOrbMock).toHaveBeenCalled();
  });

  it('renders the turbulent orb variant when the profile is not classic', () => {
    render(<LoadingOrb message="Loading..." size={140} />);

    expect(turbulentOrbMock).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Loading...',
        size: 140,
      }),
    );
  });
});
