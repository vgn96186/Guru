import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import AgendaItem from './AgendaItem';

describe('AgendaItem', () => {
  const defaultProps = {
    time: '10:00 AM',
    title: 'Test Agenda Item',
    type: 'new' as const,
    subjectName: 'Test Subject',
    priority: 5,
    onPress: jest.fn(),
  };

  it('renders correctly with default props', () => {
    const { getByText, getByLabelText } = render(<AgendaItem {...defaultProps} />);

    expect(getByText('10:00 AM')).toBeTruthy();
    expect(getByText('Test Agenda Item')).toBeTruthy();
    expect(getByText('NEW')).toBeTruthy();
    expect(getByText('Test Subject')).toBeTruthy();
    expect(getByLabelText('Open Test Agenda Item')).toBeTruthy();
  });

  it('calls onPress when pressed', () => {
    const { getByLabelText } = render(<AgendaItem {...defaultProps} />);
    fireEvent.press(getByLabelText('Open Test Agenda Item'));
    expect(defaultProps.onPress).toHaveBeenCalled();
  });

  it('renders review type badge', () => {
    const { getByText } = render(<AgendaItem {...defaultProps} type="review" />);
    expect(getByText('REVIEW')).toBeTruthy();
    expect(getByText('Test Subject')).toBeTruthy();
  });

  it('renders deep dive type badge', () => {
    const { getByText } = render(<AgendaItem {...defaultProps} type="deep_dive" />);
    expect(getByText('DEEP DIVE')).toBeTruthy();
    expect(getByText('Test Subject')).toBeTruthy();
  });

  it('renders high yield badge when priority is 8 or higher', () => {
    const { getByText } = render(<AgendaItem {...defaultProps} priority={8} />);
    expect(getByText('HY')).toBeTruthy();
  });

  it('does not render high yield badge when priority is below 8', () => {
    const { queryByText } = render(<AgendaItem {...defaultProps} priority={7} />);
    expect(queryByText('HY')).toBeNull();
  });
});
