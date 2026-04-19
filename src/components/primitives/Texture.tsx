import React from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Circle, Defs, Pattern, Rect } from 'react-native-svg';
import { FEATURE_TEXTURE } from '../../config/appConfig';

interface TextureProps {
  /** Opacity of the dots. Keep below 0.05. */
  intensity?: number;
}

/** Faint dot dither; renders nothing unless FEATURE_TEXTURE is true. */
export default function Texture({ intensity = 0.04 }: TextureProps) {
  if (!FEATURE_TEXTURE) return null;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Svg width="100%" height="100%">
        <Defs>
          <Pattern id="dots" x="0" y="0" width="4" height="4" patternUnits="userSpaceOnUse">
            <Circle cx="1" cy="1" r="0.6" fill={`rgba(255,255,255,${intensity})`} />
          </Pattern>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#dots)" />
      </Svg>
    </View>
  );
}
