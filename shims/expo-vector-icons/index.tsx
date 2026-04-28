import React from 'react';
import RemixIcon from 'react-native-remix-icon';
import type { IconStyle } from '../../src/theme/iconography';
import { resolveRemixIconName } from '../../src/components/primitives/remixIconCompat';

export type IoniconsName = string;

export interface IoniconsProps {
  name: IoniconsName;
  size?: number;
  color?: string;
  style?: any;
  accessibilityLabel?: string;
  [key: string]: any;
}

function deriveStyleFromName(name: string): IconStyle {
  const n = name.trim().replace(/-sharp$/, '');
  if (!n.endsWith('-outline')) return 'filled';
  const base = n.replace(/-outline$/, '');
  if (base === 'home' || base === 'grid' || base === 'chatbubbles' || base === 'menu')
    return 'outlined';
  return 'filled';
}

function IoniconsComponent({
  name,
  size = 24,
  color = 'black',
  accessibilityLabel,
  ...rest
}: IoniconsProps) {
  const style = deriveStyleFromName(name);
  const resolved = resolveRemixIconName(name, style);
  return (
    <RemixIcon
      name={resolved as any}
      size={size}
      color={color}
      accessibilityLabel={accessibilityLabel}
      fallback={null}
      {...rest}
    />
  );
}

export const Ionicons = Object.assign(IoniconsComponent, {
  glyphMap: {} as Record<string, number>,
});
