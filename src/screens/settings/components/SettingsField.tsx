import React, { type ComponentProps } from 'react';
import { StyleSheet, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import LinearText from '../../../components/primitives/LinearText';
import type { LinearTextTone } from '../../../components/primitives/LinearText';
import LinearTextInput from '../../../components/primitives/LinearTextInput';
import { linearTheme } from '../../../theme/linearTheme';
import SettingsLabel from './SettingsLabel';

interface SettingsFieldProps extends Omit<
  ComponentProps<typeof LinearTextInput>,
  'style' | 'containerStyle'
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
  const helperText = error ?? hint;

  return (
    <>
      <SettingsLabel text={label} />
      <LinearTextInput
        {...inputProps}
        containerStyle={[styles.inputContainer, inputContainerStyle]}
        style={[styles.input, inputStyle]}
      />
      {helperText ? (
        <LinearText
          variant="body"
          tone={error ? 'error' : hintTone}
          style={[styles.hint, error && styles.errorText, hintStyle]}
        >
          {helperText}
        </LinearText>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  inputContainer: {
    backgroundColor: linearTheme.colors.background,
    borderRadius: 10,
    borderColor: linearTheme.colors.border,
    marginBottom: 4,
  },
  input: {
    color: linearTheme.colors.textPrimary,
    fontSize: 14,
  },
  hint: {
    color: linearTheme.colors.textMuted,
    fontSize: 12,
    marginBottom: 4,
  },
  errorText: {
    color: linearTheme.colors.error,
  },
});
