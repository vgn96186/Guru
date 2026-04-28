import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import * as Haptics from 'expo-haptics';
import SettingsIconButton from './SettingsIconButton';

describe('SettingsIconButton', () => {
  it('renders with default testID', () => {
    const { getByTestId } = render(<SettingsIconButton onPress={() => {}} />);
    expect(getByTestId('settings-button')).toBeTruthy();
  });

  it('does not trigger haptics on press in', () => {
    const { getByTestId } = render(<SettingsIconButton onPress={() => {}} />);
    fireEvent(getByTestId('settings-button'), 'pressIn');
    expect(Haptics.impactAsync).not.toHaveBeenCalled();
  });
});
