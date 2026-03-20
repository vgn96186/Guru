import React from 'react';
import { render } from '@testing-library/react-native';
import QuickStatsCard from './QuickStatsCard';

jest.mock('react-native-svg', () => {
  const React = require('react');
  const Svg = ({ children, ...props }: { children?: React.ReactNode; [k: string]: unknown }) =>
    React.createElement('Svg', props, children);
  const Circle = (props: Record<string, unknown>) => React.createElement('Circle', props);
  return {
    __esModule: true,
    default: Svg,
    Circle,
  };
});

describe('QuickStatsCard', () => {
  const defaultProps = {
    progressPercent: 45,
    todayMinutes: 45,
    dailyGoal: 100,
    streak: 5,
    level: 12,
    completedSessions: 3,
  };

  it('renders correctly with default props', () => {
    const { getByText, getByLabelText } = render(<QuickStatsCard {...defaultProps} />);

    expect(getByText('Your Progress')).toBeTruthy();
    expect(getByText('55 min left to hit today target.')).toBeTruthy();
    expect(getByText('45%')).toBeTruthy();
    expect(getByText('5 day streak')).toBeTruthy();
    expect(getByText('Level 12')).toBeTruthy();
    expect(getByText('3 sessions')).toBeTruthy();

    expect(
      getByLabelText('Your progress today. 45% of daily goal. 5 day streak. Level 12. 3 sessions.'),
    ).toBeTruthy();
  });

  it('renders "1 session" (singular) when completedSessions is 1', () => {
    const { getByText } = render(<QuickStatsCard {...defaultProps} completedSessions={1} />);
    expect(getByText('1 session')).toBeTruthy();
  });

  it('renders "0 sessions" when completedSessions is 0', () => {
    const { getByText } = render(<QuickStatsCard {...defaultProps} completedSessions={0} />);
    expect(getByText('0 sessions')).toBeTruthy();
  });

  it('renders goal complete message when progressPercent is 100', () => {
    const { getByText } = render(
      <QuickStatsCard {...defaultProps} progressPercent={100} todayMinutes={100} />,
    );
    expect(getByText('Daily goal complete. Stack one more high-yield block.')).toBeTruthy();
  });

  it('renders goal complete message when progressPercent exceeds 100', () => {
    const { getByText, getByLabelText } = render(
      <QuickStatsCard {...defaultProps} progressPercent={120} todayMinutes={120} />,
    );
    expect(getByText('Daily goal complete. Stack one more high-yield block.')).toBeTruthy();
    expect(getByText('100%')).toBeTruthy();
    expect(
      getByLabelText(
        'Your progress today. 100% of daily goal. 5 day streak. Level 12. 3 sessions.',
      ),
    ).toBeTruthy();
  });

  it('handles negative todayMinutes gracefully in remaining time calculation', () => {
    const { getByText } = render(<QuickStatsCard {...defaultProps} todayMinutes={-10} />);
    expect(getByText('110 min left to hit today target.')).toBeTruthy();
  });

  it('handles negative progressPercent by clamping to 0%', () => {
    const { getByText, getByLabelText } = render(
      <QuickStatsCard {...defaultProps} progressPercent={-10} todayMinutes={-10} />,
    );
    expect(getByText('0%')).toBeTruthy();
    expect(
      getByLabelText('Your progress today. 0% of daily goal. 5 day streak. Level 12. 3 sessions.'),
    ).toBeTruthy();
  });
});
