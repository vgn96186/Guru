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

interface SettingsIconButtonProps extends Omit<PressableProps, 'style'> {
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
  /** Icon size. Default: 22 */
  iconSize?: number;
  /** Icon color. Default: textSecondary */
  iconColor?: string;
  testID?: string;
}

/**
 * A large, easy-to-tap settings gear button for screen headers.
 * 48x48 touch target with a 22px Ionicon — designed for one-tap reliability.
 */
export default function SettingsIconButton({
  onPress,
  style,
  iconSize = 22,
  iconColor = n.colors.textSecondary,
  testID = 'settings-button',
  ...rest
}: SettingsIconButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.button, pressed && styles.pressed, style]}
      android_ripple={{ color: n.colors.surfaceHover, borderless: true, radius: 24 }}
      accessibilityRole="button"
      accessibilityLabel="Open settings"
      testID={testID}
      {...rest}
    >
      <Ionicons name="settings-sharp" size={iconSize} color={iconColor} />
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
