import React from 'react';
import { Text } from 'react-native';
import { render, fireEvent } from '@testing-library/react-native';
import ErrorBoundary from './ErrorBoundary';

function Bomb({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) {
    throw new Error('unit test boom');
  }
  return <Text>child ok</Text>;
}

describe('ErrorBoundary', () => {
  it('renders children when there is no error', () => {
    const { getByText } = render(
      <ErrorBoundary>
        <Bomb shouldThrow={false} />
      </ErrorBoundary>,
    );
    expect(getByText('child ok')).toBeTruthy();
  });

  it('renders fallback UI when a child throws', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const { getByText, getByLabelText } = render(
      <ErrorBoundary>
        <Bomb shouldThrow />
      </ErrorBoundary>,
    );
    expect(getByText('Something went wrong')).toBeTruthy();
    expect(getByText(/your progress, notes, and streak data are still safe/i)).toBeTruthy();
    expect(getByLabelText('Reload app')).toBeTruthy();
    expect(getByLabelText('Reset view')).toBeTruthy();
    spy.mockRestore();
  });

  it('reload button calls expo-updates reloadAsync when available', () => {
    // Resolved via jest.unit.config moduleNameMapper → __mocks__/expo-updates.js
    const reloadAsync = require('expo-updates').reloadAsync as jest.Mock;
    reloadAsync.mockClear();
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const { getByLabelText } = render(
      <ErrorBoundary>
        <Bomb shouldThrow />
      </ErrorBoundary>,
    );
    fireEvent.press(getByLabelText('Reload app'));
    expect(reloadAsync).toHaveBeenCalled();
    spy.mockRestore();
  });
});
