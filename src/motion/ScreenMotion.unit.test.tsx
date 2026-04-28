import React from 'react';
import { Text } from 'react-native';
import { act, render } from '@testing-library/react-native';
import * as Reanimated from 'react-native-reanimated';

import ScreenMotion from './ScreenMotion';
import { screenEnterTiming } from './presets';
import { AccessibilityInfo } from 'react-native';

describe('ScreenMotion', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    (AccessibilityInfo.isReduceMotionEnabled as jest.Mock).mockResolvedValue(false);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('does not re-run the focus animation after the first mount when animateOnFocus is false', async () => {
    const timingSpy = jest.spyOn(Reanimated, 'withTiming');

    const view = render(
      <ScreenMotion isFocused animateOnFocus={false}>
        <Text>child</Text>
      </ScreenMotion>,
    );

    await act(async () => {
      jest.advanceTimersByTime(screenEnterTiming.duration);
      await Promise.resolve();
    });

    view.rerender(
      <ScreenMotion isFocused={false} animateOnFocus={false}>
        <Text>child</Text>
      </ScreenMotion>,
    );

    view.rerender(
      <ScreenMotion isFocused animateOnFocus={false}>
        <Text>child</Text>
      </ScreenMotion>,
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(timingSpy).toHaveBeenCalledTimes(1);
  });
});
