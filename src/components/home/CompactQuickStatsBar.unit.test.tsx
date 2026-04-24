import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { Animated } from 'react-native';
import CompactQuickStatsBar from './CompactQuickStatsBar';
import { profileRepository } from '../../db/repositories';
import { queryClient } from '../../services/queryClient';
import { PROFILE_QUERY_KEY } from '../../hooks/queries/useProfile';

jest.mock('../../motion/useReducedMotion', () => ({
  useReducedMotion: () => false,
}));

jest.mock('../../db/repositories', () => ({
  profileRepository: {
    updateProfile: jest.fn(() => Promise.resolve()),
  },
}));

jest.mock('../../services/queryClient', () => ({
  queryClient: {
    invalidateQueries: jest.fn(() => Promise.resolve()),
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

  it('renders bar layout, a11y summary, percent mode, streak, and level chip', () => {
    const { getByLabelText, getByText } = render(
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
    expect(getByText('TODAY')).toBeTruthy();
    expect(getByText('63%')).toBeTruthy();
    expect(getByText('STREAK')).toBeTruthy();
    expect(getByText('9')).toBeTruthy();
    expect(getByText('days')).toBeTruthy();
    expect(getByText('LEVEL')).toBeTruthy();
    expect(getByText('4')).toBeTruthy();
    expect(getByText('SESSIONS')).toBeTruthy();
    expect(getByText('12')).toBeTruthy();
  });

  it('shows the current minutes and opens the goal picker on press', () => {
    const { getByText, getByLabelText, getByTestId } = render(
      <CompactQuickStatsBar
        progressPercent={63}
        todayMinutes={75}
        dailyGoal={120}
        streak={9}
        level={4}
        completedSessions={12}
      />,
    );

    expect(getByText('75 / 120m')).toBeTruthy();
    fireEvent.press(getByLabelText('Change daily goal'));
    expect(getByTestId('goal-overlay')).toBeTruthy();
  });

  it('rounds progress percent for display and a11y label', () => {
    const { getByText, getByLabelText } = render(
      <CompactQuickStatsBar
        progressPercent={62.6}
        todayMinutes={0}
        dailyGoal={60}
        streak={0}
        level={1}
        completedSessions={0}
      />,
    );
    expect(getByText('63%')).toBeTruthy();
    expect(getByLabelText(/Daily progress 63 percent/)).toBeTruthy();
  });

  it('clamps progress percent into 0–100 for bar and label', () => {
    const { getByText, getByLabelText } = render(
      <CompactQuickStatsBar
        progressPercent={150}
        todayMinutes={200}
        dailyGoal={120}
        streak={1}
        level={2}
        completedSessions={3}
      />,
    );
    expect(getByText('100%')).toBeTruthy();
    expect(getByLabelText(/Daily progress 100 percent/)).toBeTruthy();
  });

  it('shows overlay goal chips on press, then persists a new goal', async () => {
    const onGoalChange = jest.fn();
    const { getByTestId, getByText, getByLabelText, queryByText } = render(
      <CompactQuickStatsBar
        progressPercent={63}
        todayMinutes={75}
        dailyGoal={120}
        streak={9}
        level={4}
        completedSessions={12}
        onGoalChange={onGoalChange}
      />,
    );

    expect(queryByText('30m')).toBeNull();

    fireEvent.press(getByLabelText('Change daily goal'));

    expect(getByTestId('goal-overlay')).toBeTruthy();
    for (const minutes of [30, 60, 90, 120, 180, 240]) {
      expect(getByText(`${minutes}m`)).toBeTruthy();
    }

    fireEvent.press(getByText('90m'));

    await waitFor(() => {
      expect(profileRepository.updateProfile).toHaveBeenCalledWith({ dailyGoalMinutes: 90 });
      expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: PROFILE_QUERY_KEY });
      expect(onGoalChange).toHaveBeenCalledWith(90);
      expect(queryByText('30m')).toBeNull();
    });
  });
});
