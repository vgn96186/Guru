import React, { type ComponentProps } from 'react';
import {
  View,
  Text,
  TextInput,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { linearTheme as n } from '../../../theme/linearTheme';

interface SettingsFieldProps extends Omit<
  ComponentProps<typeof TextInput>,
  'style' | 'containerStyle'
> {
  label: string;
  hint?: string;
  error?: string;
  hintTone?: string;
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
  const helperText = error ?? hint;

  return (
    <View style={{ marginBottom: 16 }}>
      <Text style={{ fontSize: 13, fontWeight: '500', color: '#E8E8E8', marginBottom: 8 }}>
        {label}
      </Text>
      <TextInput
        style={{
          width: '100%',
          height: 44,
          backgroundColor: 'rgba(255, 255, 255, 0.03)',
          borderRadius: 8,
          borderWidth: 1,
          borderColor: 'rgba(255, 255, 255, 0.08)',
          paddingHorizontal: 12,
          color: '#E8E8E8',
          fontSize: 15,
        }}
        placeholderTextColor="#5E626B"
        {...inputProps}
      />
      {helperText ? (
        <Text style={{ fontSize: 12, marginTop: 8, color: error ? '#F87171' : '#8A8F98' }}>
          {helperText}
        </Text>
      ) : null}
    </View>
  );
}
