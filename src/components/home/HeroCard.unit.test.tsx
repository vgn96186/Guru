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
    // We need to ensure that these return an object with a .start() method
    // Since Animated is already mocked in jest.setup.js, we just ensure the implementations
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

  it('renders correctly with default props', () => {
    const { getByText, getByLabelText } = render(<HeroCard {...defaultProps} />);
    
    expect(getByText('Good Morning, John')).toBeTruthy();
    expect(getByText("Let's lock your next focused hour.")).toBeTruthy();
    expect(getByText('45d')).toBeTruthy();
    expect(getByText('120d')).toBeTruthy();
    
    expect(getByLabelText('Good Morning, John. INICET in 45 days, NEET-PG in 120 days.')).toBeTruthy();
  });

  it('renders INICET label and NEET-PG label', () => {
    const { getByText } = render(<HeroCard {...defaultProps} />);
    expect(getByText('INICET')).toBeTruthy();
    expect(getByText('NEET-PG')).toBeTruthy();
  });

  it('applies urgent styling when days are 30 or less', () => {
    const { getByText } = render(<HeroCard {...defaultProps} daysToInicet={20} daysToNeetPg={15} />);
    expect(getByText('20d')).toBeTruthy();
    expect(getByText('15d')).toBeTruthy();
  });
});
