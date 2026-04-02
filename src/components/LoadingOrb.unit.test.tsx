import React from 'react';
import { render } from '@testing-library/react-native';
import LoadingOrb from './LoadingOrb';

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
  it('renders without crashing on mount', () => {
    const { root } = render(<LoadingOrb />);
    expect(root).toBeTruthy();
  });

  it('renders with custom size', () => {
    const { root } = render(<LoadingOrb size={120} />);
    expect(root).toBeTruthy();
  });
});
