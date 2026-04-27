import React from 'react';
import {
  Pressable,
  StyleSheet,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { linearTheme as n } from '../../theme/linearTheme';

interface BackIconButtonProps extends Omit<PressableProps, 'style'> {
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  /** Icon size. Default: 20 */
  iconSize?: number;
  /** Icon color. Default: textPrimary */
  iconColor?: string;
  testID?: string;
}

/**
 * A large, easy-to-tap back chevron button for screen headers.
 * 48x48 touch target matching the settings button — one-tap reliability.
 */
export default function BackIconButton({
  onPress,
  style,
  iconSize = 22,
  iconColor = n.colors.textPrimary,
  testID = 'back-button',
  ...rest
}: BackIconButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.button, pressed && styles.pressed, style]}
      android_ripple={{ color: n.colors.surfaceHover, borderless: true, radius: 24 }}
      accessibilityRole="button"
      accessibilityLabel="Go back"
      testID={testID}
      {...rest}
    >
      <Ionicons name="chevron-back" size={iconSize} color={iconColor} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: n.colors.surfaceHover,
    borderWidth: 1,
    borderColor: n.colors.borderHighlight,
  },
  pressed: {
    opacity: n.alpha.pressed,
  },
});
