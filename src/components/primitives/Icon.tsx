import React from 'react';
import RemixIcon from 'react-native-remix-icon';
import { linearTheme } from '../../theme/linearTheme';
import {
  iconSize,
  DEFAULT_ICON_SIZE,
  DEFAULT_ICON_STYLE,
  type IconSize,
  type IconStyle,
} from '../../theme/iconography';
import { resolveRemixIconName } from './remixIconCompat';

interface IconProps {
  name: string;
  size?: IconSize;
  style?: IconStyle;
  color?: string;
  accessibilityLabel?: string;
}

/** Outlined by default. Pass style="filled" for selected-state only. */
export default function Icon({
  name,
  size = DEFAULT_ICON_SIZE,
  style = DEFAULT_ICON_STYLE,
  color = linearTheme.colors.textPrimary,
  accessibilityLabel,
}: IconProps) {
  const resolved = resolveRemixIconName(name, style);
  return (
    <RemixIcon
      name={resolved as any}
      size={iconSize[size]}
      color={color}
      accessibilityLabel={accessibilityLabel}
      fallback={null}
    />
  );
}
