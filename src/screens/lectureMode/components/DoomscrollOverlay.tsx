import React from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import LinearText from '../../../components/primitives/LinearText';
import { linearTheme as n } from '../../../theme/linearTheme';

export function DoomscrollOverlay() {
  return (
    <View
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: n.colors.error,
        zIndex: 999,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 40,
      }}
    >
      <Ionicons name="phone-portrait-outline" size={80} color={n.colors.textPrimary} />
      <LinearText
        style={{
          color: n.colors.textPrimary,
          fontSize: 32,
          fontWeight: '900',
          textAlign: 'center',
          textTransform: 'uppercase',
        }}
      >
        PUT YOUR PHONE DOWN.
      </LinearText>
      <LinearText
        style={{
          color: n.colors.textPrimary,
          fontSize: 20,
          textAlign: 'center',
          marginTop: 20,
        }}
      >
        You are doomscrolling instead of watching this lecture!
      </LinearText>
    </View>
  );
}
