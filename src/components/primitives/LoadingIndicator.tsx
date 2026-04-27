import React from 'react';
import { View, StyleProp, ViewStyle } from 'react-native';
import { NativeLoadingOrbView } from '../../../modules/app-launcher';

interface LoadingIndicatorProps {
  size?: number | 'small' | 'large';
  style?: StyleProp<ViewStyle>;
  color?: string; // accepted but ignored to maintain drop-in compatibility with ActivityIndicator
}

export default function LoadingIndicator({ size = 40, style, color }: LoadingIndicatorProps) {
  const numericSize = size === 'small' ? 20 : size === 'large' ? 36 : size;

  return (
    <View
      style={[
        { width: numericSize, height: numericSize, alignItems: 'center', justifyContent: 'center' },
        style,
      ]}
    >
      <NativeLoadingOrbView
        isTurbulent={true}
        pathIntensity={0.8}
        breathIntensity={0}
        style={{
          position: 'absolute',
          top: '-30%',
          left: '-30%',
          width: '160%',
          height: '160%',
        }}
      />
    </View>
  );
}
