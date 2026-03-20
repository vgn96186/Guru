import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import StudyGoalsSection from './StudyGoalsSection';

describe('StudyGoalsSection', () => {
  const defaultProps = {
    inicetDate: '2024-05-10',
    neetDate: '2024-06-23',
    sessionLength: '45',
    dailyGoal: '300',
    onInicetDateChange: jest.fn(),
    onNeetDateChange: jest.fn(),
    onSessionLengthChange: jest.fn(),
    onDailyGoalChange: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders correctly with default props', () => {
    const { getByText, getByDisplayValue } = render(<StudyGoalsSection {...defaultProps} />);
    
    expect(getByText('STUDY GOALS')).toBeTruthy();
    expect(getByText('INICET Exam Date')).toBeTruthy();
    expect(getByText('NEET-PG Exam Date')).toBeTruthy();
    expect(getByText('Session (min)')).toBeTruthy();
    expect(getByText('Goal (min/day)')).toBeTruthy();

    expect(getByDisplayValue('2024-05-10')).toBeTruthy();
    expect(getByDisplayValue('2024-06-23')).toBeTruthy();
    expect(getByDisplayValue('45')).toBeTruthy();
    expect(getByDisplayValue('300')).toBeTruthy();
  });

  it('triggers onInicetDateChange when INICET date is changed', () => {
    const { getByDisplayValue } = render(<StudyGoalsSection {...defaultProps} />);
    const input = getByDisplayValue('2024-05-10');
    fireEvent.changeText(input, '2024-11-10');
    expect(defaultProps.onInicetDateChange).toHaveBeenCalledWith('2024-11-10');
  });

  it('triggers onNeetDateChange when NEET date is changed', () => {
    const { getByDisplayValue } = render(<StudyGoalsSection {...defaultProps} />);
    const input = getByDisplayValue('2024-06-23');
    fireEvent.changeText(input, '2025-01-05');
    expect(defaultProps.onNeetDateChange).toHaveBeenCalledWith('2025-01-05');
  });

  it('triggers onSessionLengthChange when session length is changed', () => {
    const { getByDisplayValue } = render(<StudyGoalsSection {...defaultProps} />);
    const input = getByDisplayValue('45');
    fireEvent.changeText(input, '60');
    expect(defaultProps.onSessionLengthChange).toHaveBeenCalledWith('60');
  });

  it('triggers onDailyGoalChange when daily goal is changed', () => {
    const { getByDisplayValue } = render(<StudyGoalsSection {...defaultProps} />);
    const input = getByDisplayValue('300');
    fireEvent.changeText(input, '400');
    expect(defaultProps.onDailyGoalChange).toHaveBeenCalledWith('400');
  });

  it('renders error messages when provided', () => {
    const { getByText } = render(
      <StudyGoalsSection 
        {...defaultProps} 
        errorInicet="Invalid INICET date" 
        errorNeet="Invalid NEET date" 
      />
    );
    
    expect(getByText('Invalid INICET date')).toBeTruthy();
    expect(getByText('Invalid NEET date')).toBeTruthy();
  });

  it('applies error styling when errors are present', () => {
    const { getByDisplayValue } = render(
      <StudyGoalsSection 
        {...defaultProps} 
        errorInicet="Error" 
      />
    );
    
    const input = getByDisplayValue('2024-05-10');
    // Check if style includes inputError properties
    // In React Native testing library, we can check props.style
    expect(input.props.style).toContainEqual({ borderColor: '#FF9800' }); // theme.colors.warning
  });

  it('uses number-pad keyboard for numeric inputs', () => {
    const { getByDisplayValue } = render(<StudyGoalsSection {...defaultProps} />);
    
    const sessionInput = getByDisplayValue('45');
    const goalInput = getByDisplayValue('300');
    
    expect(sessionInput.props.keyboardType).toBe('number-pad');
    expect(goalInput.props.keyboardType).toBe('number-pad');
  });
});
