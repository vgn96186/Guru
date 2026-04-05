import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import PermissionRow from './PermissionRow';

describe('PermissionRow', () => {
  const defaultProps = {
    label: 'Camera',
    status: 'granted',
    onFix: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders correctly when status is granted', () => {
    const { getByText, queryByText } = render(<PermissionRow {...defaultProps} />);

    expect(getByText('Camera')).toBeTruthy();
    expect(getByText('Granted')).toBeTruthy();
    expect(queryByText('Fix')).toBeNull();

    // Check color for granted
    const statusText = getByText('Granted');
    expect(statusText.props.style).toContainEqual({ color: '#3FB950' });
  });

  it('renders correctly when status is denied', () => {
    const { getByText } = render(<PermissionRow {...defaultProps} status="denied" />);

    expect(getByText('Camera')).toBeTruthy();
    expect(getByText('Missing')).toBeTruthy();
    expect(getByText('Fix')).toBeTruthy();

    // Check color for denied
    const statusText = getByText('Missing');
    expect(statusText.props.style).toContainEqual({ color: '#F14C4C' });
  });

  it('triggers onFix when Fix button is pressed', () => {
    const { getByText } = render(<PermissionRow {...defaultProps} status="denied" />);

    fireEvent.press(getByText('Fix'));
    expect(defaultProps.onFix).toHaveBeenCalledTimes(1);
  });
});
