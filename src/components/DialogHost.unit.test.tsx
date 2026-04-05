import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { DialogHost } from './DialogHost';
import { __resetDialogServiceForTests, showDialog } from './dialogService';

describe('DialogHost', () => {
  beforeEach(() => {
    __resetDialogServiceForTests();
    jest.clearAllMocks();
  });

  afterEach(() => {
    __resetDialogServiceForTests();
  });

  it('shows one dialog at a time and resolves the pressed action id', async () => {
    const { getByText, queryByText } = render(<DialogHost />);

    let resultPromise!: Promise<string | 'dismissed'>;
    await act(async () => {
      resultPromise = showDialog({
        title: 'Clear cache?',
        message: 'This regenerates cards later.',
        actions: [
          { id: 'cancel', label: 'Cancel', variant: 'secondary' },
          { id: 'clear', label: 'Clear', variant: 'destructive' },
        ],
      });
    });

    await waitFor(() => {
      expect(getByText('Clear cache?')).toBeTruthy();
      expect(getByText('This regenerates cards later.')).toBeTruthy();
    });

    await act(async () => {
      fireEvent.press(getByText('Clear'));
    });

    await expect(resultPromise).resolves.toBe('clear');
    await waitFor(() => {
      expect(queryByText('Clear cache?')).toBeNull();
    });
  });

  it('queues later dialogs until the active one is dismissed', async () => {
    const { getByText, queryByText } = render(<DialogHost />);

    let firstPromise!: Promise<string | 'dismissed'>;
    let secondPromise!: Promise<string | 'dismissed'>;
    await act(async () => {
      firstPromise = showDialog({
        title: 'First dialog',
        message: 'First message',
        actions: [{ id: 'next', label: 'Next', variant: 'primary' }],
      });
      secondPromise = showDialog({
        title: 'Second dialog',
        message: 'Second message',
        actions: [{ id: 'done', label: 'Done', variant: 'primary' }],
      });
    });

    await waitFor(() => {
      expect(getByText('First dialog')).toBeTruthy();
      expect(queryByText('Second dialog')).toBeNull();
    });

    await act(async () => {
      fireEvent.press(getByText('Next'));
    });
    await expect(firstPromise).resolves.toBe('next');

    await waitFor(() => {
      expect(getByText('Second dialog')).toBeTruthy();
    });

    await act(async () => {
      fireEvent.press(getByText('Done'));
    });
    await expect(secondPromise).resolves.toBe('done');
  });
});
