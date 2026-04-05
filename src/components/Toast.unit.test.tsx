import React from 'react';
import { act, render } from '@testing-library/react-native';
import { ToastContainer, __resetToastForTests, showToast } from './Toast';

describe('Toast', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    __resetToastForTests();
    jest.clearAllMocks();
  });

  afterEach(() => {
    act(() => {
      jest.runOnlyPendingTimers();
    });
    jest.useRealTimers();
    __resetToastForTests();
  });

  it('keeps legacy showToast(message, type, onPress, duration) calls working', () => {
    const { getByText } = render(<ToastContainer />);

    act(() => {
      showToast('Lecture saved', 'success');
    });

    expect(getByText('Lecture saved')).toBeTruthy();
  });

  it('accepts object-style toast calls for richer variants', () => {
    const { getByText } = render(<ToastContainer />);

    act(() => {
      showToast({
        title: 'Backup saved',
        message: 'Full backup created successfully.',
        variant: 'success',
      });
    });

    expect(getByText('Backup saved')).toBeTruthy();
    expect(getByText('Full backup created successfully.')).toBeTruthy();
  });

  it('warns when the host is not mounted yet', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    showToast('Host missing', 'warning');

    expect(warnSpy).toHaveBeenCalledWith('[Toast] WARNING: Host missing');
  });
});
