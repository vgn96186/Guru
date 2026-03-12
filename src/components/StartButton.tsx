import React, { useEffect, useRef } from 'react';
import { Animated, TouchableOpacity, Text, View, StyleSheet } from 'react-native';
import * as Haptics from 'expo-haptics';
import { theme } from '../constants/theme';

interface Props {
  onPress: () => void;
  label?: string;
  sublabel?: string;
  color?: string;
  disabled?: boolean;
  disabledLabel?: string;
}

export default function StartButton({
  onPress,
  label = 'START SESSION',
  sublabel,
  color = theme.colors.primary,
  disabled = false,
  disabledLabel = 'LOADING...',
}: Props) {
  const scale = useRef(new Animated.Value(1)).current;
  const glow = useRef(new Animated.Value(0)).current;

  function handlePress() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onPress();
  }

  useEffect(() => {
    if (disabled) {
      scale.setValue(1.0);
      glow.setValue(0);
      return;
    }
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
          onPress={handlePress}
          disabled={disabled}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Start study session"
          accessibilityState={{ disabled }}
          testID="start-session-btn"
          style={[styles.button, { backgroundColor: disabled ? theme.colors.cardHover : color }, disabled && styles.buttonDisabled]}
        >
          <Text
            style={styles.label}
            numberOfLines={2}
            adjustsFontSizeToFit
            minimumFontScale={0.75}
          >
            {disabled ? disabledLabel : label}
          </Text>
          {sublabel ? (
            <Text
              style={styles.sublabel}
              numberOfLines={2}
              adjustsFontSizeToFit
              minimumFontScale={0.85}
            >
              {sublabel}
            </Text>
          ) : null}
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}

const SIZE = 240;
const RADIUS = SIZE / 2;

const styles = StyleSheet.create({
  glowWrapper: {
    width: SIZE,
    height: SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glowLayer: {
    position: 'absolute',
    width: SIZE,
    height: SIZE,
    borderRadius: RADIUS,
    shadowColor: theme.colors.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 35,
    shadowOpacity: 0.8,
    elevation: 20,
  },
  button: {
    width: SIZE,
    height: SIZE,
    borderRadius: RADIUS,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 12,
    paddingHorizontal: 24,
  },
  buttonDisabled: { opacity: 0.6 },
  label: {
    color: theme.colors.textPrimary,
    fontWeight: '900',
    fontSize: 22,
    letterSpacing: 1.4,
    textAlign: 'center',
    width: '85%',
  },
  sublabel: {
    color: theme.colors.textSecondary,
    fontSize: 16,
    marginTop: 8,
    textAlign: 'center',
    width: '90%',
    lineHeight: 22,
  },
});
