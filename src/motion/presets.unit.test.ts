import React from 'react';
import { Text } from 'react-native';
import {
  cardPressTiming,
  screenEnterTiming,
  SCREEN_MOTION_TRIGGERS,
  sectionStaggerMs,
  useReducedMotion,
} from './index';

const TestRenderer = require('react-test-renderer') as {
  create: (element: React.ReactElement) => { toJSON: () => unknown };
  act: (callback: () => void | Promise<void>) => Promise<void>;
};

import { AccessibilityInfo } from 'react-native';

jest.mock('../motion/ScreenMotion', () => ({
  __esModule: true,
  default: (props: Record<string, unknown>) => React.createElement(Text, props, 'screen-motion'),
}));

describe('motion presets', () => {
  it('exports expressive-but-short screen timing', () => {
    expect(screenEnterTiming.duration).toBeGreaterThanOrEqual(220);
    expect(screenEnterTiming.duration).toBeLessThanOrEqual(280);
  });

  it('exports tight stagger intervals', () => {
    expect(sectionStaggerMs).toBeGreaterThanOrEqual(45);
    expect(sectionStaggerMs).toBeLessThanOrEqual(60);
  });

  it('keeps press-in faster than press-out', () => {
    expect(cardPressTiming.in).toBeLessThan(cardPressTiming.out);
  });

  it('exports supported screen motion triggers', () => {
    expect(SCREEN_MOTION_TRIGGERS).toContain('first-mount');
    expect(SCREEN_MOTION_TRIGGERS).toContain('focus-settle');
    expect(SCREEN_MOTION_TRIGGERS).toContain('manual');
  });

  it('reads reduced-motion state through the barrel export', async () => {
    (AccessibilityInfo.isReduceMotionEnabled as jest.Mock).mockResolvedValueOnce(true);
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    try {
      const Probe = () => React.createElement(Text, null, useReducedMotion() ? 'reduced' : 'full');
      let renderer: { toJSON: () => unknown } | undefined;

      await TestRenderer.act(async () => {
        renderer = TestRenderer.create(React.createElement(Probe));
      });

      await TestRenderer.act(async () => {
        await Promise.resolve();
      });

      expect(AccessibilityInfo.isReduceMotionEnabled).toHaveBeenCalledTimes(1);
      expect(AccessibilityInfo.addEventListener).toHaveBeenCalledWith(
        'reduceMotionChanged',
        expect.any(Function),
      );
      expect(renderer?.toJSON()).toMatchObject({
        type: 'Text',
        children: ['reduced'],
      });
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });

  it('keeps PageTransition as a pure delegation wrapper', () => {
    const PageTransition = require('../components/PageTransition').default as (
      props: Record<string, unknown>,
    ) => React.ReactElement;

    const element = PageTransition({
      children: React.createElement(Text, null, 'child'),
    }) as React.ReactElement<{
      children: React.ReactNode;
      trigger?: unknown;
      isFocused?: unknown;
    }>;

    expect(element.props.trigger).toBeUndefined();
    expect(element.props.isFocused).toBeUndefined();
    expect(element.props.children).toMatchObject({
      type: Text,
    });
  });
});
