import React from 'react';
import { View, ViewStyle } from 'react-native';
import LinearText from '../primitives/LinearText';

interface Props {
  label: string;
  active?: boolean;
  style?: ViewStyle;
}

export function SettingsChip({ label, active, style }: Props) {
  return (
    <View
      style={[
        {
          paddingHorizontal: 8,
          paddingVertical: 2,
          borderRadius: 4,
          borderWidth: 1,
          backgroundColor: active ? 'rgba(94, 106, 210, 0.1)' : 'rgba(255,255,255,0.05)',
          borderColor: active ? 'rgba(94, 106, 210, 0.2)' : 'rgba(255, 255, 255, 0.08)',
        },
        style,
      ]}
    >
      <LinearText
        variant="meta"
        style={{
          fontSize: 11,
          fontWeight: active ? '500' : '400',
          color: active ? '#5E6AD2' : '#8A8F98',
        }}
      >
        {label}
      </LinearText>
    </View>
  );
}
