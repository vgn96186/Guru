import React from 'react';
import { render } from '@testing-library/react-native';
import { Animated, StyleSheet } from 'react-native';
import ExamCountdownChips from './ExamCountdownChips';
import { linearTheme as n } from '../../theme/linearTheme';

describe('ExamCountdownChips', () => {
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

  it('renders the compact inline exam countdown copy', () => {
    const { getByLabelText, getByText } = render(
      <ExamCountdownChips daysToInicet={25} daysToNeetPg={140} />,
    );

    expect(getByLabelText('INICET in 25 days, NEET-PG in 140 days.')).toBeTruthy();
    expect(getByText('INICET ')).toBeTruthy();
    expect(getByText('25')).toBeTruthy();
    expect(getByText(' days · NEET-PG ')).toBeTruthy();
    expect(getByText('140')).toBeTruthy();
    expect(getByText(' days')).toBeTruthy();
  });

  it('highlights urgent day values without tinting the labels', () => {
    const { getByText } = render(<ExamCountdownChips daysToInicet={20} daysToNeetPg={45} />);

    const daysStyle = StyleSheet.flatten(getByText('20').props.style);
    const labelStyle = StyleSheet.flatten(getByText('INICET ').props.style);

    expect(daysStyle.color).toBe(n.colors.warning);
    expect(labelStyle.color).toBe(n.colors.textMuted);
  });

  it('shows refresh button when onRefreshExamDates is provided', () => {
    const onRefresh = jest.fn().mockResolvedValue(undefined);
    const { getByLabelText, queryByLabelText } = render(
      <ExamCountdownChips daysToInicet={25} daysToNeetPg={140} onRefreshExamDates={onRefresh} />,
    );

    expect(getByLabelText('Refresh exam dates from web')).toBeTruthy();
  });

  it('hides refresh button when onRefreshExamDates is not provided', () => {
    const { queryByLabelText } = render(
      <ExamCountdownChips daysToInicet={25} daysToNeetPg={140} />,
    );

    expect(queryByLabelText('Refresh exam dates from web')).toBeNull();
  });
});
