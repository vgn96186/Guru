import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { Animated } from 'react-native';
import CompactQuickStatsBar from './CompactQuickStatsBar';
import { profileRepository } from '../../db/repositories';
import { useAppStore } from '../../store/useAppStore';

jest.mock('../../motion/useReducedMotion', () => ({
  useReducedMotion: () => false,
}));

jest.mock('../../db/repositories', () => ({
  profileRepository: {
    updateProfile: jest.fn(() => Promise.resolve()),
  },
}));

jest.mock('../../store/useAppStore', () => ({
  useAppStore: {
    getState: jest.fn(() => ({
      refreshProfile: jest.fn(),
    })),
  },
}));

describe('CompactQuickStatsBar', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (Animated.timing as jest.Mock).mockReturnValue({
      start: jest.fn((cb) => cb && cb({ finished: true })),
      stop: jest.fn(),
    });
    (Animated.sequence as jest.Mock).mockReturnValue({
      start: jest.fn((cb) => cb && cb({ finished: true })),
      stop: jest.fn(),
    });
    (Animated.parallel as jest.Mock).mockReturnValue({
      start: jest.fn((cb) => cb && cb({ finished: true })),
      stop: jest.fn(),
    });
    (Animated.loop as jest.Mock).mockReturnValue({
      start: jest.fn(),
      stop: jest.fn(),
    });
  });

  it('renders the compact progress, streak, and level summary', () => {
    const { getByLabelText, getByTestId, getByText } = render(
      <CompactQuickStatsBar
        progressPercent={63}
        todayMinutes={75}
        dailyGoal={120}
        streak={9}
        level={4}
        completedSessions={12}
      />,
    );

    expect(
      getByLabelText(
        'Daily progress 63 percent. 75 of 120 minutes completed. 9 day streak. Level 4. 12 sessions done.',
      ),
    ).toBeTruthy();
    expect(getByText('63%')).toBeTruthy();
    expect(getByText('75/')).toBeTruthy();
    expect(getByText('120m')).toBeTruthy();
    expect(getByTestId('streak-flame-ember')).toBeTruthy();
    expect(getByText('9')).toBeTruthy();
    expect(getByText('days')).toBeTruthy();
    expect(getByText('streak')).toBeTruthy();
    expect(getByText('Level 4')).toBeTruthy();
    expect(getByText('12 done')).toBeTruthy();
  });

  it('shows an overlay goal picker and updates the selected target', async () => {
    const refreshProfile = jest.fn();
    (useAppStore.getState as jest.Mock).mockReturnValue({ refreshProfile });

    const { getByTestId, getByText, queryByText } = render(
      <CompactQuickStatsBar
        progressPercent={63}
        todayMinutes={75}
        dailyGoal={120}
        streak={9}
        level={4}
        completedSessions={12}
      />,
    );

    expect(queryByText('30m')).toBeNull();

    fireEvent.press(getByText('120m'));

    expect(getByTestId('goal-overlay')).toBeTruthy();
    expect(getByText('30m')).toBeTruthy();
    expect(getByText('60m')).toBeTruthy();
    expect(getByText('90m')).toBeTruthy();
    expect(getByText('180m')).toBeTruthy();

    fireEvent.press(getByText('90m'));

    await waitFor(() => {
      expect(profileRepository.updateProfile).toHaveBeenCalledWith({ dailyGoalMinutes: 90 });
      expect(queryByText('30m')).toBeNull();
    });
  });
});
