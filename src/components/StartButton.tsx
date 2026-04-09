import React, { useEffect } from 'react';
import { TouchableOpacity, View, StyleSheet, useWindowDimensions } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  cancelAnimation,
  Easing,
} from 'react-native-reanimated';
import Svg, { Defs, RadialGradient, Stop, Circle, Ellipse } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import { linearTheme as n } from '../theme/linearTheme';
import LinearText from './primitives/LinearText';

const PHONE_SIZE = 156;
const TABLET_SIZE = 220;
const TABLET_BREAKPOINT = 600;
const BOX_STEP = 4000;
const easeBreath = Easing.bezier(0.4, 0.0, 0.2, 1);

interface Props {
  onPress: () => void;
  label?: string;
  sublabel?: string;
  color?: string;
  disabled?: boolean;
  disabledLabel?: string;
  hidden?: boolean;
}

const StartButton = React.forwardRef<View, Props>(function StartButton(
  {
    onPress,
    label = 'START SESSION',
    sublabel,
    color = n.colors.accent,
    disabled = false,
    disabledLabel = 'LOADING...',
    hidden = false,
  },
  ref,
) {
  const { width } = useWindowDimensions();
  const isTablet = width >= TABLET_BREAKPOINT;
  const size = isTablet ? TABLET_SIZE : PHONE_SIZE;
  const radius = size / 2;

  const breathScale = useSharedValue(1);
  const breathGlow = useSharedValue(0);
  const highlightTranslateY = useSharedValue(0);
  const highlightOpacity = useSharedValue(0.45);

  useEffect(() => {
    if (hidden || disabled) {
      cancelAnimation(breathScale);
      cancelAnimation(breathGlow);
      cancelAnimation(highlightTranslateY);
      cancelAnimation(highlightOpacity);
      breathScale.value = 1;
      breathGlow.value = 0;
      highlightTranslateY.value = 0;
      highlightOpacity.value = 0.45;
      return;
    }

    breathScale.value = withSequence(
      withTiming(1.08, { duration: BOX_STEP / 2, easing: easeBreath }),
      withRepeat(
        withSequence(
          withTiming(1.08, { duration: BOX_STEP }),
          withTiming(0.92, { duration: BOX_STEP, easing: easeBreath }),
          withTiming(0.92, { duration: BOX_STEP }),
          withTiming(1.08, { duration: BOX_STEP, easing: easeBreath }),
        ),
        -1,
        false,
      ),
    );

    breathGlow.value = withSequence(
      withTiming(0.95, { duration: BOX_STEP / 2, easing: easeBreath }),
      withRepeat(
        withSequence(
          withTiming(0.95, { duration: BOX_STEP }),
          withTiming(0.05, { duration: BOX_STEP, easing: easeBreath }),
          withTiming(0.05, { duration: BOX_STEP }),
          withTiming(0.95, { duration: BOX_STEP, easing: easeBreath }),
        ),
        -1,
        false,
      ),
    );

    highlightTranslateY.value = withSequence(
      withTiming(3, { duration: BOX_STEP / 2, easing: easeBreath }),
      withRepeat(
        withSequence(
          withTiming(3, { duration: BOX_STEP }),
          withTiming(-2, { duration: BOX_STEP, easing: easeBreath }),
          withTiming(-2, { duration: BOX_STEP }),
          withTiming(3, { duration: BOX_STEP, easing: easeBreath }),
        ),
        -1,
        false,
      ),
    );

    highlightOpacity.value = withSequence(
      withTiming(0.75, { duration: BOX_STEP / 2, easing: easeBreath }),
      withRepeat(
        withSequence(
          withTiming(0.75, { duration: BOX_STEP }),
          withTiming(0.35, { duration: BOX_STEP, easing: easeBreath }),
          withTiming(0.35, { duration: BOX_STEP }),
          withTiming(0.75, { duration: BOX_STEP, easing: easeBreath }),
        ),
        -1,
        false,
      ),
    );

    return () => {
      cancelAnimation(breathScale);
      cancelAnimation(breathGlow);
      cancelAnimation(highlightTranslateY);
      cancelAnimation(highlightOpacity);
    };
  }, [disabled, hidden, breathGlow, breathScale, highlightOpacity, highlightTranslateY]);

  const styleOrbBody = useAnimatedStyle(() => ({
    transform: [{ scale: breathScale.value }],
  }));

  const styleGlow = useAnimatedStyle(() => ({
    opacity: breathGlow.value,
  }));

  const styleHighlight = useAnimatedStyle(() => ({
    transform: [{ translateY: highlightTranslateY.value }],
    opacity: highlightOpacity.value,
  }));

  function handlePress() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onPress();
  }

  const btnColor = disabled ? n.colors.cardHover : color;

  return (
    <View ref={ref} collapsable={false} style={hidden ? styles.hidden : undefined}>
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
          { width: size, height: size, borderRadius: radius },
          disabled && styles.buttonDisabled,
        ]}
      >
        <Animated.View
          pointerEvents="none"
          style={[
            styles.orbVisual,
            { width: size, height: size, borderRadius: radius },
            styleOrbBody,
          ]}
        >
          <Animated.View
            style={[
              styles.glowLayer,
              { width: size, height: size, borderRadius: radius, shadowColor: color },
              styleGlow,
            ]}
          />

          <View
            style={[
              styles.orbCore,
              { width: size, height: size, borderRadius: radius, backgroundColor: btnColor },
            ]}
          >
            <View style={[StyleSheet.absoluteFill, { borderRadius: radius, overflow: 'hidden' }]}>
              <Svg width={size} height={size} viewBox="0 0 100 100">
                <Defs>
                  <RadialGradient
                    id="startColorGrad"
                    cx="45%"
                    cy="45%"
                    rx="55%"
                    ry="55%"
                    fx="45%"
                    fy="45%"
                  >
                    <Stop offset="0%" stopColor={n.colors.accent} stopOpacity="1" />
                    <Stop offset="60%" stopColor={n.colors.accent} stopOpacity="1" />
                    <Stop offset="100%" stopColor={n.colors.accent} stopOpacity="1" />
                  </RadialGradient>
                  <RadialGradient
                    id="startLightGrad"
                    cx="30%"
                    cy="28%"
                    rx="65%"
                    ry="65%"
                    fx="30%"
                    fy="28%"
                  >
                    <Stop offset="0%" stopColor="#ffffff" stopOpacity="0.6" />
                    <Stop offset="35%" stopColor="#ffffff" stopOpacity="0.1" />
                    <Stop offset="65%" stopColor="#000000" stopOpacity="0.0" />
                    <Stop offset="85%" stopColor="#000000" stopOpacity="0.25" />
                    <Stop offset="100%" stopColor="#000000" stopOpacity="0.5" />
                  </RadialGradient>
                </Defs>
                <Circle cx="50" cy="50" r="50" fill="url(#startColorGrad)" />
                <Circle cx="50" cy="50" r="50" fill="url(#startLightGrad)" />
              </Svg>
            </View>

            <Animated.View style={[styles.specularContainer, styleHighlight]}>
              <Svg width={40} height={25} viewBox="0 0 40 25">
                <Defs>
                  <RadialGradient id="startSpecularHighlight" cx="50%" cy="50%" rx="50%" ry="50%">
                    <Stop offset="0%" stopColor="#ffffff" stopOpacity="0.9" />
                    <Stop offset="60%" stopColor="#ffffff" stopOpacity="0.3" />
                    <Stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
                  </RadialGradient>
                </Defs>
                <Ellipse cx="20" cy="12.5" rx="18" ry="10" fill="url(#startSpecularHighlight)" />
              </Svg>
            </Animated.View>
          </View>
        </Animated.View>

        <View pointerEvents="none" style={styles.textLayer}>
          <LinearText
            variant="body"
            tone="inverse"
            style={[styles.label, isTablet && styles.labelTablet]}
            numberOfLines={2}
            adjustsFontSizeToFit
            minimumFontScale={0.75}
          >
            {disabled ? disabledLabel : label}
          </LinearText>
          {sublabel ? (
            <LinearText
              variant="bodySmall"
              tone="muted"
              style={[styles.sublabel, isTablet && styles.sublabelTablet]}
              numberOfLines={2}
              adjustsFontSizeToFit
              minimumFontScale={0.85}
            >
              {sublabel}
            </LinearText>
          ) : null}
        </View>
      </TouchableOpacity>
    </View>
  );
});

export default StartButton;

const styles = StyleSheet.create({
  hidden: {
    opacity: 0,
  },
  button: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  orbVisual: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  orbCore: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  glowLayer: {
    position: 'absolute',
    backgroundColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 40,
    shadowOpacity: 1,
    elevation: 30,
  },
  specularContainer: {
    position: 'absolute',
    top: '15%',
    left: '18%',
  },
  textLayer: {
    position: 'absolute',
    width: '90%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDisabled: { opacity: 0.6 },
  label: {
    color: n.colors.textPrimary,
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
