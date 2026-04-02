import React from 'react';
import { View, StyleSheet, type ViewProps } from 'react-native';
import { linearTheme } from '../../theme/linearTheme';

interface LinearDividerProps extends ViewProps {
  vertical?: boolean;
}

export default function LinearDivider({ vertical = false, style, ...props }: LinearDividerProps) {
  return (
    <View
      style={[styles.base, vertical ? styles.vertical : styles.horizontal, style]}
      {...props}
    />
  );
}

const styles = StyleSheet.create({
  base: {
    backgroundColor: linearTheme.colors.border,
  },
  horizontal: {
    height: 1,
    width: '100%',
  },
  vertical: {
    width: 1,
    height: '100%',
  },
});
