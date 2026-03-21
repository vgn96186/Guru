import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import VaultScreen from './VaultScreen';

const mockNavigate = jest.fn();

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    navigate: mockNavigate,
  }),
}));

describe('VaultScreen', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
  });

  it('renders a launcher that opens the notes hub', () => {
    const { getByLabelText, getByText } = render(<VaultScreen />);

    expect(getByText('Notes Vault')).toBeTruthy();

    fireEvent.press(getByLabelText(/open notes hub/i));

    expect(mockNavigate).toHaveBeenCalledWith('NotesHub');
  });
});
