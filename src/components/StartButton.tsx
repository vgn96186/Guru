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
    if (disabled) return; // Don't animate when disabled
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(scale, { toValue: 1.04, duration: 1200, useNativeDriver: true }),
        Animated.timing(scale, { toValue: 1.0,  duration: 1200, useNativeDriver: true }),
      ]),
    );
    const glowAnim = Animated.loop(
      Animated.sequence([
        Animated.timing(glow, { toValue: 1, duration: 1200, useNativeDriver: true }),
        Animated.timing(glow, { toValue: 0, duration: 1200, useNativeDriver: true }),
      ]),
    );
    pulse.start();
    glowAnim.start();
    return () => { pulse.stop(); glowAnim.stop(); };
  }, [disabled]);

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <View style={styles.glowWrapper}>
        <Animated.View style={[styles.glowLayer, { opacity: glow, backgroundColor: color }]} />
        <TouchableOpacity
          onPress={onPress}
          disabled={disabled}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Start study session"
          accessibilityState={{ disabled }}
          testID="start-session-btn"
          style={[styles.button, { backgroundColor: disabled ? '#333' : color }]}
        >
          <Text
            style={styles.label}
            numberOfLines={2}
            adjustsFontSizeToFit
            minimumFontScale={0.75}
          >
            {label}
          </Text>
          {sublabel ? (
            <Text
              style={styles.sublabel}
              numberOfLines={2}
              adjustsFontSizeToFit
              minimumFontScale={0.8}
            >
              {sublabel}
            </Text>
          ) : null}
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  glowWrapper: {
    width: 220,
    height: 220,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glowLayer: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
    shadowColor: '#6C63FF',
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 30,
    shadowOpacity: 0.8,
    elevation: 20,
  },
  button: {
    width: 220,
    height: 220,
    borderRadius: 110,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 12,
  },
  label: {
    color: '#fff',
    fontWeight: '900',
    fontSize: 18,
    letterSpacing: 2,
    textAlign: 'center',
    width: '80%',
  },
  sublabel: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    marginTop: 6,
    textAlign: 'center',
    width: '75%',
  },
});
