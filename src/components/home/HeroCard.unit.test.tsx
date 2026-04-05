import React from 'react';
import { render } from '@testing-library/react-native';
import { Animated, Easing, StyleSheet } from 'react-native';
import HeroCard from './HeroCard';
import { linearTheme as n } from '../../theme/linearTheme';

jest.mock('../../motion', () => ({
  decorativeIdleDelayMs: 320,
  useReducedMotion: () => false,
}));

describe('HeroCard', () => {
  const defaultProps = {
    daysToInicet: 45,
    daysToNeetPg: 120,
  };

  beforeAll(() => {
    (Easing as any).inOut = (fn: any) => fn;
  });

  beforeEach(() => {
    (Animated.timing as jest.Mock).mockReturnValue({
      start: jest.fn((cb) => cb && cb({ finished: true })),
      stop: jest.fn(),
    });
    (Animated.sequence as jest.Mock).mockReturnValue({
      start: jest.fn((cb) => cb && cb({ finished: true })),
      stop: jest.fn(),
    });
    (Animated.loop as jest.Mock).mockReturnValue({
      start: jest.fn(),
      stop: jest.fn(),
    });
  });

  it('renders exam countdown labels', () => {
    const { getByText } = render(<HeroCard {...defaultProps} />);

    expect(getByText('EXAM COUNTDOWN')).toBeTruthy();
    expect(getByText('INICET')).toBeTruthy();
    expect(getByText('NEET-PG')).toBeTruthy();
    expect(getByText('45')).toBeTruthy();
    expect(getByText('120')).toBeTruthy();
  });

  it('keeps urgency styling scoped to the urgent exam only', () => {
    const { getByText } = render(
      <HeroCard {...defaultProps} daysToInicet={20} daysToNeetPg={120} entryComplete={false} />,
    );

    const inicetStyle = StyleSheet.flatten(getByText('20').props.style);
    const neetStyle = StyleSheet.flatten(getByText('120').props.style);

    expect(inicetStyle.color).toBe(n.colors.warning);
    expect(neetStyle.color).toBe(n.colors.textPrimary);
  });

  it('starts a single pulse loop when entry completes and any exam is urgent', () => {
    render(<HeroCard {...defaultProps} daysToInicet={20} daysToNeetPg={120} entryComplete />);

    expect(Animated.loop).toHaveBeenCalledTimes(1);
  });
});
