import React, { useEffect, useRef } from 'react';
import { Animated, TouchableOpacity, Text, View, StyleSheet } from 'react-native';

interface Props {
  onPress: () => void;
  label?: string;
  sublabel?: string;
  color?: string;
  disabled?: boolean;
}

export default function StartButton({
  onPress,
  label = 'START SESSION',
  sublabel,
  color = '#6C63FF',
  disabled = false,
}: Props) {
  const scale = useRef(new Animated.Value(1)).current;
  const glow = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(scale, { toValue: 1.04, duration: 1200, useNativeDriver: true }),
        Animated.timing(scale, { toValue: 1.0,  duration: 1200, useNativeDriver: true }),
      ]),
    );
    const glowAnim = Animated.loop(
      Animated.sequence([
        Animated.timing(glow, { toValue: 1, duration: 1200, useNativeDriver: false }),
        Animated.timing(glow, { toValue: 0, duration: 1200, useNativeDriver: false }),
      ]),
    );
    pulse.start();
    glowAnim.start();
    return () => { pulse.stop(); glowAnim.stop(); };
  }, []);

  const shadowRadius = glow.interpolate({ inputRange: [0, 1], outputRange: [8, 24] });
  const shadowOpacity = glow.interpolate({ inputRange: [0, 1], outputRange: [0.3, 0.7] });

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <TouchableOpacity
        onPress={onPress}
        disabled={disabled}
        activeOpacity={0.85}
        style={[styles.button, { backgroundColor: disabled ? '#333' : color }]}
      >
        <Text style={styles.label}>{label}</Text>
        {sublabel ? <Text style={styles.sublabel}>{sublabel}</Text> : null}
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 220,
    height: 220,
    borderRadius: 110,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 12,
    shadowColor: '#6C63FF',
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 20,
    shadowOpacity: 0.6,
  },
  label: {
    color: '#fff',
    fontWeight: '900',
    fontSize: 18,
    letterSpacing: 2,
    textAlign: 'center',
  },
  sublabel: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    marginTop: 6,
    textAlign: 'center',
  },
});
