import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { Switch } from 'react-native';
import NotificationSection from './NotificationSection';

describe('NotificationSection', () => {
  const defaultProps = {
    enabled: true,
    onEnabledChange: jest.fn(),
    hour: '7',
    onHourChange: jest.fn(),
    frequency: 'normal' as 'rare' | 'normal' | 'frequent' | 'off',
    onFrequencyChange: jest.fn(),
    onTest: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders correctly with default props', () => {
    const { getByText, getByDisplayValue } = render(<NotificationSection {...defaultProps} />);
    
    expect(getByText("Enable Guru's reminders")).toBeTruthy();
    expect(getByText("Personalized daily accountability messages")).toBeTruthy();
    expect(getByDisplayValue('7')).toBeTruthy();
    
    expect(getByText('Rare')).toBeTruthy();
    expect(getByText('Normal')).toBeTruthy();
    expect(getByText('Frequent')).toBeTruthy();
    expect(getByText('Off')).toBeTruthy();
    
    expect(getByText('Schedule Notifications Now')).toBeTruthy();
  });

  it('triggers onEnabledChange when Switch is toggled', () => {
    const { getByRole } = render(<NotificationSection {...defaultProps} />);
    // In React Native, Switch might be found by role 'switch' or just use the component.
    // RNTL fireEvent.valueChange for Switch.
    const switchComponent = render(<NotificationSection {...defaultProps} />).UNSAFE_getByType(require('react-native').Switch);
    fireEvent(switchComponent, 'valueChange', false);
    expect(defaultProps.onEnabledChange).toHaveBeenCalledWith(false);
  });

  it('triggers onHourChange when TextInput value changes', () => {
    const { getByDisplayValue } = render(<NotificationSection {...defaultProps} />);
    const input = getByDisplayValue('7');
    fireEvent.changeText(input, '8');
    expect(defaultProps.onHourChange).toHaveBeenCalledWith('8');
  });

  it('triggers onFrequencyChange when a frequency button is pressed', () => {
    const { getByText } = render(<NotificationSection {...defaultProps} />);
    fireEvent.press(getByText('Frequent'));
    expect(defaultProps.onFrequencyChange).toHaveBeenCalledWith('frequent');
  });

  it('triggers onTest when test button is pressed', () => {
    const { getByText } = render(<NotificationSection {...defaultProps} />);
    fireEvent.press(getByText('Schedule Notifications Now'));
    expect(defaultProps.onTest).toHaveBeenCalled();
  });

  it('renders error message when error prop is provided', () => {
    const { getByText } = render(<NotificationSection {...defaultProps} error="Invalid hour" />);
    expect(getByText('Invalid hour')).toBeTruthy();
  });

  it('applies active styling to the current frequency button text', () => {
    const { getByText } = render(<NotificationSection {...defaultProps} frequency="frequent" />);
    const activeText = getByText('Frequent');
    // StyleSheet is mocked to return the object itself, and flatten is mocked to merge them.
    // In RNTL, we can check the props.style of the rendered component.
    expect(activeText.props.style).toContainEqual({ color: '#6C63FF', fontWeight: '700' });
  });

  it('uses number-pad keyboard for hour input', () => {
    const { getByDisplayValue } = render(<NotificationSection {...defaultProps} />);
    const input = getByDisplayValue('7');
    expect(input.props.keyboardType).toBe('number-pad');
  });

  it('renders correctly with empty hour', () => {
    const { getByDisplayValue } = render(<NotificationSection {...defaultProps} hour="" />);
    expect(getByDisplayValue('')).toBeTruthy();
  });
});
