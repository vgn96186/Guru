import React from 'react';
import { View, StyleSheet, type ViewProps } from 'react-native';
interface LinearDividerProps extends ViewProps {
  vertical?: boolean;
}

export default function LinearDivider({ vertical = false, style, ...props }: LinearDividerProps) {
  return (
    <View style={[styles.base, vertical ? styles.vertical : styles.horizontal, style]} {...props} />
  );
}

const styles = StyleSheet.create({
  base: {
    backgroundColor: 'rgba(255, 255, 255, 0.07)',
  },
  horizontal: {
    height: StyleSheet.hairlineWidth,
    width: '100%',
  },
  vertical: {
    width: StyleSheet.hairlineWidth,
    height: '100%',
  },
});
