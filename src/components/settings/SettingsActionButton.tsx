import React from 'react';
import { TouchableOpacity, ViewStyle } from 'react-native';
import LinearText from '../primitives/LinearText';

interface Props {
  label: string;
  onPress: () => void;
  style?: ViewStyle;
}

export function SettingsActionButton({ label, onPress, style }: Props) {
  return (
    <TouchableOpacity
      style={[
        {
          paddingHorizontal: 12,
          paddingVertical: 6,
          backgroundColor: 'rgba(255,255,255,0.05)',
          borderRadius: 6,
          borderWidth: 1,
          borderColor: 'rgba(255,255,255,0.1)',
          alignItems: 'center',
          justifyContent: 'center',
        },
        style,
      ]}
      onPress={onPress}
    >
      <LinearText variant="body" style={{ fontSize: 12, color: '#E8E8E8' }}>
        {label}
      </LinearText>
    </TouchableOpacity>
  );
}
