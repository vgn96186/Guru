import React from 'react';
import { render } from '@testing-library/react-native';
import HeroCard from './HeroCard';

describe('HeroCard', () => {
  it('shows the nearer exam as the hero with its day count', () => {
    const { getByText } = render(<HeroCard daysToInicet={45} daysToNeetPg={120} />);
    expect(getByText('Next · INICET')).toBeTruthy();
    expect(getByText('45')).toBeTruthy();
    expect(getByText('NEET-PG in 120 days')).toBeTruthy();
  });

  it('picks NEET-PG as hero when it is nearer', () => {
    const { getByText } = render(<HeroCard daysToInicet={200} daysToNeetPg={60} />);
    expect(getByText('Next · NEET-PG')).toBeTruthy();
    expect(getByText('60')).toBeTruthy();
    expect(getByText('INICET in 200 days')).toBeTruthy();
  });

  it('shows urgency warning when hero exam is within 90 days', () => {
    const { getByText } = render(<HeroCard daysToInicet={30} daysToNeetPg={200} />);
    expect(getByText('within 90 days')).toBeTruthy();
  });

  it('does not show urgency warning when hero exam is beyond 90 days', () => {
    const { queryByText } = render(<HeroCard daysToInicet={150} daysToNeetPg={200} />);
    expect(queryByText('within 90 days')).toBeNull();
  });

  it('renders correct accessibility label regardless of hero choice', () => {
    const { getByLabelText } = render(<HeroCard daysToInicet={45} daysToNeetPg={120} />);
    expect(getByLabelText('Exam countdown: INICET in 45 days, NEET-PG in 120 days.')).toBeTruthy();
  });
});
