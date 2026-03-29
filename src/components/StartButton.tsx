import React, { useEffect, useRef } from 'react';
import {
  Animated,
  TouchableOpacity,
  Text,
  View,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import Svg, { Defs, RadialGradient, Stop, Circle } from 'react-native-svg';
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

  const btnColor = disabled ? theme.colors.cardHover : color;

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <View style={[styles.glowWrapper, { width: size, height: size }]}>
        {/* Outer glow */}
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
        {/* Touchable orb */}
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
              backgroundColor: btnColor,
            },
            disabled && styles.buttonDisabled,
          ]}
        >
          {/* SVG orb layers */}
          <View style={[StyleSheet.absoluteFill, { borderRadius: radius, overflow: 'hidden' }]}>
            <Svg width={size} height={size}>
              <Defs>
                {/* Main body gradient — top-left lit sphere */}
                <RadialGradient id="orbBody" cx="38%" cy="32%" rx="60%" ry="60%" fx="38%" fy="32%">
                  <Stop offset="0%" stopColor="#ffffff" stopOpacity="0.18" />
                  <Stop offset="45%" stopColor="#ffffff" stopOpacity="0.03" />
                  <Stop offset="100%" stopColor="#000000" stopOpacity="0.22" />
                </RadialGradient>
                {/* Specular highlight — small bright spot */}
                <RadialGradient id="specular" cx="35%" cy="28%" rx="22%" ry="22%" fx="35%" fy="28%">
                  <Stop offset="0%" stopColor="#ffffff" stopOpacity="0.30" />
                  <Stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
                </RadialGradient>
                {/* Rim light — subtle edge glow on the opposite side */}
                <RadialGradient id="rimLight" cx="72%" cy="75%" rx="35%" ry="35%" fx="72%" fy="75%">
                  <Stop offset="0%" stopColor="#ffffff" stopOpacity="0.10" />
                  <Stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
                </RadialGradient>
              </Defs>
              {/* Body shading */}
              <Circle cx={radius} cy={radius} r={radius} fill="url(#orbBody)" />
              {/* Specular highlight */}
              <Circle cx={radius} cy={radius} r={radius} fill="url(#specular)" />
              {/* Rim light */}
              <Circle cx={radius} cy={radius} r={radius} fill="url(#rimLight)" />
            </Svg>
          </View>
          {/* Text content */}
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
    shadowRadius: 28,
    shadowOpacity: 0.7,
    elevation: 20,
  },
  button: {
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 12,
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
    textShadowColor: 'rgba(0,0,0,0.4)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  labelTablet: {
    fontSize: 22,
    letterSpacing: 1.4,
  },
  sublabel: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 12,
    marginTop: 6,
    textAlign: 'center',
    width: '90%',
    lineHeight: 17,
    textShadowColor: 'rgba(0,0,0,0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  sublabelTablet: {
    fontSize: 15,
    marginTop: 8,
    lineHeight: 21,
  },
});
