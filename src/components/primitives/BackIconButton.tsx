import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { linearTheme as n } from '../../theme/linearTheme';
import LinearIconButton from './LinearIconButton';
import type { PressableProps } from 'react-native';

interface BackIconButtonProps extends Omit<PressableProps, 'children' | 'className'> {
  onPress?: () => void;
  /** Icon size. Default: 20 */
  iconSize?: number;
  /** Icon color. Default: textPrimary */
  iconColor?: string;
  testID?: string;
  className?: string;
}

export default function BackIconButton({
  onPress,
  iconSize = 22,
  iconColor = n.colors.textPrimary,
  testID = 'back-button',
  className,
  ...rest
}: BackIconButtonProps) {
  const finalClassName = className
    ? `w-12 h-12 overflow-hidden bg-white/[0.06] border-white/[0.18] ${className}`
    : 'w-12 h-12 overflow-hidden bg-white/[0.06] border-white/[0.18]';

  const handlePress = React.useCallback(() => {
    if (!onPress) return;
    requestAnimationFrame(() => {
      onPress();
    });
  }, [onPress]);

  return (
    <LinearIconButton
      {...rest}
      onPress={handlePress}
      variant="secondary"
      shape="round"
      className={finalClassName}
      enableHaptics={false}
      rippleColor="rgba(255, 255, 255, 0.18)"
      pressedScale={0.96}
      accessibilityLabel="Go back"
      testID={testID}
    >
      <Ionicons name="chevron-back" size={iconSize} color={iconColor} />
    </LinearIconButton>
  );
}
