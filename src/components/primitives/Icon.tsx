import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { linearTheme } from '../../theme/linearTheme';
import {
  iconSize,
  DEFAULT_ICON_SIZE,
  DEFAULT_ICON_STYLE,
  type IconSize,
  type IconStyle,
} from '../../theme/iconography';

interface IconProps {
  name: keyof typeof Ionicons.glyphMap;
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
  const resolved = style === 'filled' ? stripOutline(name) : ensureOutline(name);
  return (
    <Ionicons
      name={resolved}
      size={iconSize[size]}
      color={color}
      accessibilityLabel={accessibilityLabel}
    />
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic/trusted type
function ensureOutline(n: string): any {
  if (n.endsWith('-outline')) return n;
  if (n.startsWith('logo-')) return n;
  return `${n}-outline`;
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic/trusted type
function stripOutline(n: string): any {
  return n.replace(/-outline$/, '');
}
