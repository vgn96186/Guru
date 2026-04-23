import React from 'react';
import { act, render } from '@testing-library/react-native';
import LoadingOrb from './LoadingOrb';

const lottieMock = jest.fn((props: any) =>
  React.createElement('LottieView', { testID: 'loading-orb-lottie', ...props }),
);

jest.mock('lottie-react-native', () => {
  const React = require('react');
  return {
    __esModule: true,
    default: (props: any) => lottieMock(props),
  };
}, { virtual: true });

jest.mock('react-native-reanimated', () => {
  const React = require('react');
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

describe('LoadingOrb', () => {
  beforeEach(() => {
    lottieMock.mockClear();
  });

  it('renders without crashing on mount', () => {
    const { root } = render(<LoadingOrb />);
    expect(root).toBeTruthy();
  });

  it('renders with custom size', () => {
    const { root } = render(<LoadingOrb size={120} />);
    expect(root).toBeTruthy();
  });

  it('renders the turbulent blob using lottie', () => {
    render(<LoadingOrb />);
    expect(lottieMock).toHaveBeenCalled();
  });

  it('switches from the intro segment to the smooth loop after the first animation finishes', () => {
    render(<LoadingOrb />);

    const initialProps = lottieMock.mock.calls.at(-1)?.[0];
    expect(initialProps?.onAnimationFinish).toEqual(expect.any(Function));

    act(() => {
      initialProps.onAnimationFinish(false);
    });

    const updatedProps = lottieMock.mock.calls.at(-1)?.[0];
    expect(lottieMock).toHaveBeenCalledTimes(2);
    expect(updatedProps?.onAnimationFinish).toEqual(expect.any(Function));
  });
});
