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
    expect(getByText(/NEW · Test Subject/i)).toBeTruthy();
    expect(getByLabelText('Open Test Agenda Item')).toBeTruthy();
  });

  it('calls onPress when pressed', () => {
    const { getByLabelText } = render(<AgendaItem {...defaultProps} />);
    fireEvent.press(getByLabelText('Open Test Agenda Item'));
    expect(defaultProps.onPress).toHaveBeenCalled();
  });

  it('renders review badge and style when type is review', () => {
    const { getByText } = render(<AgendaItem {...defaultProps} type="review" />);
    expect(getByText('Due now')).toBeTruthy();
    expect(getByText(/REVIEW · Test Subject/i)).toBeTruthy();
  });

  it('renders deep dive badge and style when type is deep_dive', () => {
    const { getByText } = render(<AgendaItem {...defaultProps} type="deep_dive" />);
    expect(getByText('Weak topic')).toBeTruthy();
    expect(getByText(/DEEP DIVE · Test Subject/i)).toBeTruthy();
  });

  it('renders high yield badge when priority is 8 or higher', () => {
    const { getByText, queryByText } = render(<AgendaItem {...defaultProps} priority={8} />);
    expect(getByText('High yield')).toBeTruthy();

    const { queryByText: queryByTextLow } = render(<AgendaItem {...defaultProps} priority={7} />);
    expect(queryByTextLow('High yield')).toBeNull();
  });

  it('renders multiple badges when applicable', () => {
    const { getByText } = render(
      <AgendaItem {...defaultProps} type="review" priority={9} />
    );
    expect(getByText('Due now')).toBeTruthy();
    expect(getByText('High yield')).toBeTruthy();
  });
});
