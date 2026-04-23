import React, { type ComponentProps } from 'react';
import type { StyleProp, TextStyle, ViewStyle } from 'react-native';
import TextField from '../../../components/settings/TextField';
import type { LinearTextTone } from '../../../components/primitives/LinearText';

interface SettingsFieldProps extends Omit<
  ComponentProps<typeof TextField>,
  'containerStyle' | 'helperTone'
> {
  label: string;
  hint?: string;
  error?: string;
  hintTone?: LinearTextTone;
  hintStyle?: StyleProp<TextStyle>;
  inputStyle?: StyleProp<TextStyle>;
  inputContainerStyle?: StyleProp<ViewStyle>;
}

export default function SettingsField({
  label,
  hint,
  error,
  hintTone = 'muted',
  hintStyle,
  inputStyle,
  inputContainerStyle,
  ...inputProps
}: SettingsFieldProps) {
  return (
    <TextField
      label={label}
      hint={hint}
      error={error}
      helperTone={hintTone}
      hintStyle={hintStyle}
      inputStyle={inputStyle}
      containerStyle={inputContainerStyle}
      {...inputProps}
    />
  );
}
