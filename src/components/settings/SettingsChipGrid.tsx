import React from 'react';
import { View, ViewStyle } from 'react-native';

interface Props {
  children: React.ReactNode;
  style?: ViewStyle;
}

export function SettingsChipGrid({ children, style }: Props) {
  return (
    <View style={[{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, style]}>{children}</View>
  );
}
