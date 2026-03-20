import React from 'react';
import { render } from '@testing-library/react-native';
import HeroCard from './HeroCard';
import { Animated } from 'react-native';

describe('HeroCard', () => {
  const defaultProps = {
    greeting: 'Good Morning',
    firstName: 'John',
    daysToInicet: 45,
    daysToNeetPg: 120,
  };

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

  it('renders day counts for urgent values', () => {
    const { getByText } = render(
      <HeroCard {...defaultProps} daysToInicet={20} daysToNeetPg={15} />,
    );
    expect(getByText('20')).toBeTruthy();
    expect(getByText('15')).toBeTruthy();
  });
});
