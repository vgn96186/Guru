import React from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { linearTheme as n } from '../../theme/linearTheme';

export function IconCircle({
  name,
  color,
  size = 56,
}: {
  name: string;
  color: string;
  size?: number;
}) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: n.colors.card,
        borderWidth: 1,
        borderColor: `${color}44`,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Ionicons name={name as keyof typeof Ionicons.glyphMap} size={size * 0.5} color={color} />
    </View>
  );
}
