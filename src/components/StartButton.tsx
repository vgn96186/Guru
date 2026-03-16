import React, { useEffect, useRef } from 'react';
import { TouchableOpacity, Text, View, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';
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
  const scale = useSharedValue(1);
  const glowOpacity = useSharedValue(0.4);

  useEffect(() => {
    if (disabled) {
      glowOpacity.value = withTiming(0, { duration: 300 });
      return;
    }
    glowOpacity.value = withRepeat(
      withTiming(0.8, { duration: 1500, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
  }, [disabled, glowOpacity]);

  function handlePressIn() {
    if (disabled) return;
    scale.value = withSpring(0.96, { damping: 15, stiffness: 200 });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }

  function handlePressOut() {
    if (disabled) return;
    scale.value = withSpring(1, { damping: 15, stiffness: 200 });
  }

  function handlePress() {
    if (disabled) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onPress();
  }

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const glowStyle = useAnimatedStyle(() => ({
    opacity: glowOpacity.value,
  }));

  return (
    <View style={styles.container}>
      <Animated.View style={[styles.glowLayer, glowStyle, { backgroundColor: color }]} />
      <Animated.View style={[styles.buttonWrapper, animatedStyle]}>
        <TouchableOpacity
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          onPress={handlePress}
          disabled={disabled}
          activeOpacity={1}
          accessibilityRole="button"
          accessibilityLabel="Start study session"
          accessibilityState={{ disabled }}
          testID="start-session-btn"
          style={[
            styles.button,
            { backgroundColor: disabled ? theme.colors.cardHover : color },
            disabled && styles.buttonDisabled,
          ]}
        >
          <Text style={styles.label} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
            {disabled ? disabledLabel : label}
          </Text>
          {sublabel ? (
            <Text style={styles.sublabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>
              {sublabel}
            </Text>
          ) : null}
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: theme.spacing.xl,
    paddingHorizontal: theme.spacing.xl,
    width: '100%',
  },
  glowLayer: {
    position: 'absolute',
    width: '100%',
    height: 72,
    borderRadius: theme.radius.pill,
    shadowColor: theme.colors.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 24,
    shadowOpacity: 0.8,
    elevation: 20,
    transform: [{ scaleX: 0.9 }, { scaleY: 0.8 }],
  },
  buttonWrapper: {
    width: '100%',
    maxWidth: 400,
  },
  button: {
    width: '100%',
    minHeight: 64,
    paddingVertical: theme.spacing.lg,
    paddingHorizontal: theme.spacing.xl,
    borderRadius: theme.radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    ...theme.shadows.soft,
  },
  buttonDisabled: { opacity: 0.6 },
  label: {
    color: '#FFFFFF',
    ...theme.typography.title,
    textAlign: 'center',
  },
  sublabel: {
    color: 'rgba(255,255,255,0.8)',
    ...theme.typography.caption,
    marginTop: 2,
    textAlign: 'center',
  },
});
