import React, { useRef } from 'react';
import { StyleSheet, ViewProps, StyleProp, ViewStyle, Animated } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';

interface GlassSurfaceProps extends ViewProps {
  elevation?: 'low' | 'medium' | 'high';
  intensity?: number;
  tint?: 'light' | 'dark' | 'default';
  contentContainerStyle?: StyleProp<ViewStyle>;
  interactive?: boolean;
}

export default function GlassSurface({
  elevation = 'low',
  intensity = 24,
  tint = 'dark',
  style,
  contentContainerStyle,
  interactive = false,
  children,
  ...rest
}: GlassSurfaceProps) {
  const scale = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    if (interactive) {
      Animated.spring(scale, {
        toValue: 0.98,
        useNativeDriver: true,
      }).start();
    }
  };

  const handlePressOut = () => {
    if (interactive) {
      Animated.spring(scale, {
        toValue: 1,
        useNativeDriver: true,
      }).start();
    }
  };

  return (
    <Animated.View
      onTouchStart={handlePressIn}
      onTouchEnd={handlePressOut}
      onTouchCancel={handlePressOut}
      style={[
        styles.container,
        styles[`elevation_${elevation}`],
        style,
        interactive && { transform: [{ scale }] },
      ]}
      {...rest}
    >
      <BlurView intensity={intensity} tint={tint} style={StyleSheet.absoluteFillObject} />
      <LinearGradient
        colors={['rgba(255, 255, 255, 0.05)', 'rgba(255, 255, 255, 0.01)']}
        style={StyleSheet.absoluteFillObject}
        pointerEvents="none"
      />
      <Animated.View style={styles.borderLayer} />
      <Animated.View style={[styles.contentContainer, contentContainerStyle]}>
        {children}
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    borderRadius: 16,
    backgroundColor: 'rgba(6, 8, 12, 0.75)',
  },
  borderLayer: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 16,
    pointerEvents: 'none',
  },
  contentContainer: {
    flex: 1,
    padding: 20,
  },
  elevation_low: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 5,
  },
  elevation_medium: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 24,
    elevation: 10,
  },
  elevation_high: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.5,
    shadowRadius: 32,
    elevation: 15,
  },
});
