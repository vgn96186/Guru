import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { Switch } from 'react-native';
import StudyPreferencesSection from './StudyPreferencesSection';

describe('StudyPreferencesSection', () => {
  const defaultProps = {
    strictMode: false,
    onStrictModeChange: jest.fn(),
    visualTimers: true,
    onVisualTimersChange: jest.fn(),
    bodyDoubling: false,
    onBodyDoublingChange: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders correctly with default props', () => {
    const { getByText, UNSAFE_getAllByType } = render(
      <StudyPreferencesSection {...defaultProps} />,
    );

    expect(getByText('Strict Mode')).toBeTruthy();
    expect(getByText('Nag you instantly if you leave the app or are idle.')).toBeTruthy();

    expect(getByText('Visual Timers')).toBeTruthy();
    expect(getByText('Circular timers during breaks instead of plain text.')).toBeTruthy();

    expect(getByText('Guru presence (Body Doubling)')).toBeTruthy();
    expect(getByText('Ambient messages and pulsing dot while you study.')).toBeTruthy();

    const switches = UNSAFE_getAllByType(Switch);
    expect(switches).toHaveLength(3);

    // Check initial values
    expect(switches[0].props.value).toBe(false); // strictMode
    expect(switches[1].props.value).toBe(true); // visualTimers
    expect(switches[2].props.value).toBe(false); // bodyDoubling
  });

  it('triggers onStrictModeChange when Strict Mode switch is toggled', () => {
    const { UNSAFE_getAllByType } = render(<StudyPreferencesSection {...defaultProps} />);
    const switches = UNSAFE_getAllByType(Switch);
    fireEvent(switches[0], 'onValueChange', true);
    expect(defaultProps.onStrictModeChange).toHaveBeenCalledWith(true);
  });

  it('triggers onVisualTimersChange when Visual Timers switch is toggled', () => {
    const { UNSAFE_getAllByType } = render(<StudyPreferencesSection {...defaultProps} />);
    const switches = UNSAFE_getAllByType(Switch);
    fireEvent(switches[1], 'onValueChange', false);
    expect(defaultProps.onVisualTimersChange).toHaveBeenCalledWith(false);
  });

  it('triggers onBodyDoublingChange when Body Doubling switch is toggled', () => {
    const { UNSAFE_getAllByType } = render(<StudyPreferencesSection {...defaultProps} />);
    const switches = UNSAFE_getAllByType(Switch);
    fireEvent(switches[2], 'onValueChange', true);
    expect(defaultProps.onBodyDoublingChange).toHaveBeenCalledWith(true);
  });
});
