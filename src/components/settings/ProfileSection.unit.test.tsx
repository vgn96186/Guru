import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import ProfileSection from './ProfileSection';

describe('ProfileSection', () => {
  const defaultProps = {
    name: 'John Doe',
    onNameChange: jest.fn(),
    isSyncAvailable: true,
    onLinkDevice: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders correctly with default props', () => {
    const { getByText, getByDisplayValue, queryByText } = render(
      <ProfileSection {...defaultProps} />,
    );

    expect(getByDisplayValue('John Doe')).toBeTruthy();
    expect(getByText('Link Another Device (Sync)')).toBeTruthy();
    expect(queryByText(/Tablet Sync is currently unavailable/)).toBeNull();
  });

  it('triggers onNameChange when TextInput value changes', () => {
    const { getByDisplayValue } = render(<ProfileSection {...defaultProps} />);
    const input = getByDisplayValue('John Doe');
    fireEvent.changeText(input, 'Jane Doe');
    expect(defaultProps.onNameChange).toHaveBeenCalledWith('Jane Doe');
  });

  it('triggers onLinkDevice when Link button is pressed and sync is available', () => {
    const { getByText } = render(<ProfileSection {...defaultProps} />);
    fireEvent.press(getByText('Link Another Device (Sync)'));
    expect(defaultProps.onLinkDevice).toHaveBeenCalledTimes(1);
  });

  it('renders sync warning and disables link button when sync is unavailable', () => {
    const { getByText, getByLabelText } = render(
      <ProfileSection {...defaultProps} isSyncAvailable={false} />,
    );

    expect(getByText(/Tablet Sync is currently unavailable/)).toBeTruthy();

    const linkBtn = getByLabelText('Link another device for sync');
    expect(linkBtn.props.disabled).toBe(true);
  });

  it('applies disabled styling when sync is unavailable', () => {
    const { getByText, getByLabelText } = render(
      <ProfileSection {...defaultProps} isSyncAvailable={false} />,
    );

    const linkBtn = getByLabelText('Link another device for sync');
    const linkBtnText = getByText('Link Another Device (Sync)');

    expect([linkBtn.props.style].flat(Infinity)).toContainEqual({ opacity: 0.5 });
    expect([linkBtnText.props.style].flat(Infinity)).toContainEqual({ color: '#A0A0A5' });
  });
});
