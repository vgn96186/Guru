import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import KnowledgeTreeScreen from './KnowledgeTreeScreen';

const mockNavigate = jest.fn();

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    navigate: mockNavigate,
  }),
}));

describe('KnowledgeTreeScreen', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
  });

  it('renders a launcher that opens the syllabus surface', () => {
    const { getByLabelText, getByText } = render(<KnowledgeTreeScreen />);

    expect(getByText('Knowledge Tree')).toBeTruthy();

    fireEvent.press(getByLabelText(/open syllabus/i));

    expect(mockNavigate).toHaveBeenCalledWith('Syllabus');
  });
});
