import React from 'react';
import { View, type ViewProps, type ViewStyle, type StyleProp } from 'react-native';
import { linearTheme } from '../../theme/linearTheme';
import { elevation, type ElevationLevel } from '../../theme/elevation';

interface LinearSurfaceProps extends ViewProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  borderColor?: string;
  padded?: boolean;
  compact?: boolean;
  /** e1 is the default card surface. Use e2 for sheets/menus. */
  level?: ElevationLevel;
  /** Adds a 1px top highlight to signal interactivity. */
  interactive?: boolean;
}

export default function LinearSurface({
  children,
  style,
  borderColor,
  padded = true,
  compact = false,
  level = 'e1',
  interactive = false,
  ...rest
}: LinearSurfaceProps) {
  const tokens = elevation[level];
  const radius = compact ? linearTheme.radius.md : linearTheme.radius.lg;
  const padding = !padded ? 0 : compact ? 12 : linearTheme.spacing.md;

  return (
    <View
      style={[
        {
          borderRadius: radius,
          borderWidth: 1,
          overflow: 'hidden',
          backgroundColor: tokens.bg,
          borderColor: borderColor ?? tokens.border,
          padding,
        },
        style,
      ]}
      {...rest}
    >
      {interactive ? (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: 0,
            height: 1,
            backgroundColor: elevation.topEdgeInteractive,
          }}
        />
      ) : null}
      {children}
    </View>
  );
}
