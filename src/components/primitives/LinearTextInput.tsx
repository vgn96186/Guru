import React, { useState } from 'react';
import {
  TextInput,
  StyleSheet,
  View,
  type TextInputProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { linearTheme } from '../../theme/linearTheme';

interface LinearTextInputProps extends TextInputProps {
  containerStyle?: StyleProp<ViewStyle>;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export default function LinearTextInput({
  style,
  containerStyle,
  leftIcon,
  rightIcon,
  onFocus,
  onBlur,
  editable = true,
  ...props
}: LinearTextInputProps) {
  const [isFocused, setIsFocused] = useState(false);

  return (
    <View
      style={[
        styles.container,
        isFocused && styles.containerFocused,
        !editable && styles.containerDisabled,
        containerStyle,
      ]}
    >
      {leftIcon && <View style={styles.leftIconContainer}>{leftIcon}</View>}
      <TextInput
        style={[styles.input, style]}
        placeholderTextColor={linearTheme.colors.textMuted}
        editable={editable}
        onFocus={(e) => {
          setIsFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setIsFocused(false);
          onBlur?.(e);
        }}
        {...props}
      />
      {rightIcon && <View style={styles.rightIconContainer}>{rightIcon}</View>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: linearTheme.colors.card,
    borderWidth: 1,
    borderColor: linearTheme.colors.border,
    borderRadius: linearTheme.radius.md,
    minHeight: 44,
    paddingHorizontal: linearTheme.spacing.md,
  },
  containerFocused: {
    borderColor: `${linearTheme.colors.accent}66`,
    backgroundColor: linearTheme.colors.surfaceHover,
  },
  containerDisabled: {
    opacity: linearTheme.alpha.disabled,
  },
  input: {
    flex: 1,
    color: linearTheme.colors.textPrimary,
    fontFamily: linearTheme.typography.body.fontFamily,
    fontSize: linearTheme.typography.body.fontSize,
    paddingVertical: linearTheme.spacing.sm,
  },
  leftIconContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: linearTheme.spacing.sm,
  },
  rightIconContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: linearTheme.spacing.sm,
  },
});
