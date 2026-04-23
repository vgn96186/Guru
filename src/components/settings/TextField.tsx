import React from 'react';
import {
  View,
  TextInput,
  StyleSheet,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import LinearText, { type LinearTextTone } from '../primitives/LinearText';
import useLinearTheme from '../../hooks/useLinearTheme';

interface TextFieldProps extends Omit<TextInputProps, 'style'> {
  label: string;
  hint?: string;
  error?: string;
  helperTone?: LinearTextTone;
  errorTone?: LinearTextTone;
  labelStyle?: StyleProp<TextStyle>;
  hintStyle?: StyleProp<TextStyle>;
  inputStyle?: StyleProp<TextStyle>;
  containerStyle?: StyleProp<ViewStyle>;
}

function getToneColor(theme: ReturnType<typeof useLinearTheme>, tone: LinearTextTone) {
  switch (tone) {
    case 'secondary':
      return theme.colors.textSecondary;
    case 'muted':
      return theme.colors.textMuted;
    case 'inverse':
      return theme.colors.textInverse;
    case 'accent':
      return theme.colors.accent;
    case 'warning':
      return theme.colors.warning;
    case 'success':
      return theme.colors.success;
    case 'error':
      return theme.colors.error;
    case 'primary':
    default:
      return theme.colors.textPrimary;
  }
}

export default function TextField({
  label,
  hint,
  error,
  helperTone = 'muted',
  errorTone = 'error',
  labelStyle,
  hintStyle,
  inputStyle,
  containerStyle,
  placeholderTextColor,
  ...inputProps
}: TextFieldProps) {
  const theme = useLinearTheme();
  const helperText = error ?? hint;
  const activeTone = error ? errorTone : helperTone;
  const borderColor = error ? getToneColor(theme, errorTone) : theme.colors.border;

  return (
    <View style={[styles.container, containerStyle]}>
      <LinearText variant="label" style={[styles.label, labelStyle]}>
        {label}
      </LinearText>
      <TextInput
        style={[
          styles.input,
          {
            backgroundColor: theme.colors.surface,
            color: theme.colors.textPrimary,
          },
          { borderColor },
          inputStyle,
        ]}
        placeholderTextColor={placeholderTextColor ?? theme.colors.textMuted}
        autoCapitalize="none"
        autoCorrect={false}
        {...inputProps}
      />
      {helperText ? (
        <LinearText variant="bodySmall" tone={activeTone} style={[styles.helper, hintStyle]}>
          {helperText}
        </LinearText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 6,
  },
  input: {
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    fontSize: 14,
  },
  helper: {
    fontSize: 11,
    marginTop: 4,
    lineHeight: 16,
  },
});
