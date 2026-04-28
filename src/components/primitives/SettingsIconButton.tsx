import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { linearTheme as n } from '../../theme/linearTheme';
import LinearIconButton from './LinearIconButton';
import type { PressableProps } from 'react-native';

interface SettingsIconButtonProps extends Omit<PressableProps, 'children' | 'className'> {
  onPress: () => void;
  /** Icon size. Default: 22 */
  iconSize?: number;
  /** Icon color. Default: textSecondary */
  iconColor?: string;
  testID?: string;
  className?: string;
}

export default function SettingsIconButton({
  onPress,
  iconSize = 22,
  iconColor = n.colors.textSecondary,
  testID = 'settings-button',
  className,
  ...rest
}: SettingsIconButtonProps) {
  const finalClassName = className
    ? `w-12 h-12 overflow-hidden bg-white/[0.06] border-white/[0.18] ${className}`
    : 'w-12 h-12 overflow-hidden bg-white/[0.06] border-white/[0.18]';

  return (
    <LinearIconButton
      {...rest}
      onPress={onPress}
      variant="secondary"
      shape="round"
      className={finalClassName}
      enableHaptics={false}
      rippleColor="rgba(255, 255, 255, 0.18)"
      pressedScale={0.96}
      accessibilityLabel="Open settings"
      testID={testID}
    >
      <Ionicons name="settings-sharp" size={iconSize} color={iconColor} />
    </LinearIconButton>
  );
}
