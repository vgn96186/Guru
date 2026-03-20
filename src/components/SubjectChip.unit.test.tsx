import React from 'react';
import { render } from '@testing-library/react-native';
import SubjectChip from './SubjectChip';

describe('SubjectChip', () => {
  it('renders correctly with subject name', () => {
    const { getByText } = render(<SubjectChip subject="Physics" />);
    expect(getByText('Physics')).toBeTruthy();
  });
});
