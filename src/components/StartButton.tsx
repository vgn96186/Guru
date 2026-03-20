import React, { useEffect, useRef } from 'react';
import {
  Animated,
  TouchableOpacity,
  Text,
  View,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { theme } from '../constants/theme';

const PHONE_SIZE = 156;
const TABLET_SIZE = 220;
const TABLET_BREAKPOINT = 600;

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
  const { width } = useWindowDimensions();
  const isTablet = width >= TABLET_BREAKPOINT;
  const size = isTablet ? TABLET_SIZE : PHONE_SIZE;
  const radius = size / 2;

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
        Animated.timing(scale, { toValue: 1.0, duration: 1200, useNativeDriver: true }),
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
    return () => {
      pulse.stop();
      glowAnim.stop();
    };
  }, [disabled, glow, scale]);

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <View style={[styles.glowWrapper, { width: size, height: size }]}>
        <Animated.View
          style={[
            styles.glowLayer,
            {
              width: size,
              height: size,
              borderRadius: radius,
              opacity: glow,
              backgroundColor: color,
            },
          ]}
        />
        <TouchableOpacity
          onPress={handlePress}
          disabled={disabled}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Start study session"
          accessibilityState={{ disabled }}
          testID="start-session-btn"
          style={[
            styles.button,
            {
              width: size,
              height: size,
              borderRadius: radius,
              backgroundColor: disabled ? theme.colors.cardHover : color,
            },
            disabled && styles.buttonDisabled,
          ]}
        >
          <Text
            style={[styles.label, isTablet && styles.labelTablet]}
            numberOfLines={2}
            adjustsFontSizeToFit
            minimumFontScale={0.75}
          >
            {disabled ? disabledLabel : label}
          </Text>
          {sublabel ? (
            <Text
              style={[styles.sublabel, isTablet && styles.sublabelTablet]}
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

const styles = StyleSheet.create({
  glowWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  glowLayer: {
    position: 'absolute',
    shadowColor: theme.colors.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 24,
    shadowOpacity: 0.65,
    elevation: 16,
  },
  button: {
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 10,
    paddingHorizontal: 18,
  },
  buttonDisabled: { opacity: 0.6 },
  label: {
    color: theme.colors.textPrimary,
    fontWeight: '900',
    fontSize: 17,
    letterSpacing: 1.2,
    textAlign: 'center',
    width: '90%',
  },
  labelTablet: {
    fontSize: 22,
    letterSpacing: 1.4,
  },
  sublabel: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    marginTop: 6,
    textAlign: 'center',
    width: '90%',
    lineHeight: 17,
  },
  sublabelTablet: {
    fontSize: 15,
    marginTop: 8,
    lineHeight: 21,
  },
});
