import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import * as Haptics from 'expo-haptics';
import BackIconButton from './BackIconButton';

describe('BackIconButton', () => {
  it('renders with default testID', () => {
    const { getByTestId } = render(<BackIconButton onPress={() => {}} />);
    expect(getByTestId('back-button')).toBeTruthy();
  });

  it('does not trigger haptics on press in', () => {
    const { getByTestId } = render(<BackIconButton onPress={() => {}} />);
    fireEvent(getByTestId('back-button'), 'pressIn');
    expect(Haptics.impactAsync).not.toHaveBeenCalled();
  });
});
