import React, { useEffect, useRef } from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withDelay,
  Easing,
} from 'react-native-reanimated';
import Svg, { Defs, RadialGradient, Stop, Circle, Ellipse } from 'react-native-svg';
import { linearTheme as n } from '../theme/linearTheme';
import LinearText from './primitives/LinearText';
import { useProfileQuery } from '../hooks/queries/useProfile';
import TurbulentOrb from './TurbulentOrb';

// Derived accent shades for 3-D glass-sphere look
const ACCENT_LIGHT = '#9BA3EE';
const ACCENT_DEEP = '#4450C0';
const ACCENT_DARK = '#2E3BAC';

interface Props {
  message?: string;
  size?: number;
}

const MESSAGE_VARIATIONS: Record<string, string[]> = {
  'Guru is planning your session...': [
    'Analyzing your weak topics...',
    'Selecting optimal content...',
    'Building your study agenda...',
    'Curating medical knowledge...',
    'Planning your learning path...',
    'Personalizing your study session...',
  ],
  'Fetching content...': [
    'Consulting medical knowledge base...',
    'Generating study material...',
    'Preparing your next card...',
    'Pulling from medical databases...',
    'Crafting educational content...',
    'Building clinical scenarios...',
    "You're crushing this study session! 💪",
    'Medical knowledge loading...',
  ],
  'Loading your progress...': [
    'Syncing your study data...',
    'Calculating streak status...',
    'Preparing dashboard...',
    'Tracking your medical mastery...',
    'Measuring your progress...',
    'Analyzing your performance...',
  ],
  'Loading...': [
    'Thinking...',
    'Processing...',
    'Almost there...',
    'Brain loading...',
    'Knowledge incoming...',
    'Stay focused...',
    'You got this, Doctor! 👨‍⚕️',
    'Medical brain activated...',
  ],
  'Guru is waking up...': [
    'Brewing coffee...',
    'Connecting synapses...',
    'Booting up...',
    'Organizing the syllabus...',
    'Waking up the medical expert...',
    'Initializing knowledge systems...',
  ],
};

const MOTIVATIONAL_MESSAGES = [
  "You're building an amazing medical brain!",
  'Every study session makes you a better doctor 💙',
  'Your dedication is inspiring! Keep going! ✨',
  "Medical knowledge loading... you're almost there! 📚",
  "Stay focused, Doctor! You're making progress!",
];

function getRandomVariation(message: string): string {
  if (Math.random() < 0.2) {
    return MOTIVATIONAL_MESSAGES[Math.floor(Math.random() * MOTIVATIONAL_MESSAGES.length)];
  }

  const variations = MESSAGE_VARIATIONS[message];
  if (!variations) return message;
  return variations[Math.floor(Math.random() * variations.length)];
}

export default React.memo(function LoadingOrb({
  message = 'Hey there! Let me think...',
  size = 180,
}: Props) {
  const { data: profile } = useProfileQuery();
  const isTurbulent = profile?.loadingOrbStyle === 'turbulent';

  if (isTurbulent) {
    return <TurbulentOrb message={message} size={size} />;
  }

  const [displayMessage, setDisplayMessage] = React.useState(message);
  const lastMessageRef = useRef(message);

  useEffect(() => {
    if (lastMessageRef.current !== message) {
      lastMessageRef.current = message;
      queueMicrotask(() => setDisplayMessage(getRandomVariation(message)));
    }

    const interval = setInterval(() => {
      setDisplayMessage(getRandomVariation(message));
    }, 3000);
    return () => clearInterval(interval);
  }, [message]);

  // Core breathing
  const scaleCore = useSharedValue(0.95);
  const opacityCore = useSharedValue(0.85);

  // Ambient glow
  const opacityGlow = useSharedValue(0.4);

  // Inner tight ring
  const scaleRing0 = useSharedValue(1);
  const opacityRing0 = useSharedValue(0.7);

  // Ripple rings
  const scaleRing1 = useSharedValue(1);
  const scaleRing2 = useSharedValue(1);
  const scaleRing3 = useSharedValue(1);
  const opacityRing1 = useSharedValue(0.5);
  const opacityRing2 = useSharedValue(0.3);
  const opacityRing3 = useSharedValue(0.18);

  // Specular highlight
  const highlightTranslateY = useSharedValue(0);
  const highlightOpacity = useSharedValue(0.45);

  useEffect(() => {
    const normalCore = { duration: 1800, easing: Easing.inOut(Easing.ease) };
    const normalEmit = { duration: 3500, easing: Easing.out(Easing.quad) };

    // Core breathing
    scaleCore.value = withRepeat(withTiming(1.06, normalCore), -1, true);
    opacityCore.value = withRepeat(withTiming(1, normalCore), -1, true);

    // Ambient glow — synced to core
    opacityGlow.value = withRepeat(withTiming(0.5, normalCore), -1, true);

    // Ring 0 — tight inner energy pulse
    scaleRing0.value = withDelay(
      0,
      withRepeat(withTiming(1.9, { duration: 1100, easing: Easing.out(Easing.quad) }), -1, false),
    );
    opacityRing0.value = withDelay(
      0,
      withRepeat(withTiming(0, { duration: 1100, easing: Easing.out(Easing.quad) }), -1, false),
    );

    // Ring 1 — inner ripple
    scaleRing1.value = withDelay(0, withRepeat(withTiming(3.0, normalEmit), -1, false));
    opacityRing1.value = withDelay(0, withRepeat(withTiming(0, normalEmit), -1, false));

    // Ring 2 — mid ripple
    scaleRing2.value = withDelay(1200, withRepeat(withTiming(4.5, normalEmit), -1, false));
    opacityRing2.value = withDelay(1200, withRepeat(withTiming(0, normalEmit), -1, false));

    // Ring 3 — outer ripple
    scaleRing3.value = withDelay(
      2400,
      withRepeat(withTiming(6.5, { ...normalEmit, duration: 4000 }), -1, false),
    );
    opacityRing3.value = withDelay(
      2400,
      withRepeat(withTiming(0, { ...normalEmit, duration: 4000 }), -1, false),
    );

    // Specular highlight — subtle shift synced to breathing
    highlightTranslateY.value = withRepeat(withTiming(2, normalCore), -1, true);
    highlightOpacity.value = withRepeat(withTiming(0.55, normalCore), -1, true);
    // Shared values are stable; this effect only seeds repeating worklets on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- highlight* are Reanimated shared values, not React deps
  }, []);

  const styleCore = useAnimatedStyle(() => ({
    transform: [{ scale: scaleCore.value }],
    opacity: opacityCore.value,
  }));

  const styleGlow = useAnimatedStyle(() => ({
    opacity: opacityGlow.value,
  }));

  const styleRing0 = useAnimatedStyle(() => ({
    transform: [{ scale: scaleRing0.value }],
    opacity: opacityRing0.value,
  }));

  const styleRing1 = useAnimatedStyle(() => ({
    transform: [{ scale: scaleRing1.value }],
    opacity: opacityRing1.value,
  }));
  const styleRing2 = useAnimatedStyle(() => ({
    transform: [{ scale: scaleRing2.value }],
    opacity: opacityRing2.value,
  }));
  const styleRing3 = useAnimatedStyle(() => ({
    transform: [{ scale: scaleRing3.value }],
    opacity: opacityRing3.value,
  }));

  const styleHighlight = useAnimatedStyle(() => ({
    transform: [{ translateY: highlightTranslateY.value }],
    opacity: highlightOpacity.value,
  }));

  return (
    <View style={styles.container}>
      <View style={[styles.orbWrapper, { width: size, height: size, marginBottom: 0 }]}>
        {/* Ripple rings — outer to inner */}
        <Animated.View style={[styles.rippleRing, styleRing3]} />
        <Animated.View style={[styles.rippleRing, styleRing2]} />
        <Animated.View style={[styles.rippleRing, styleRing1]} />
        {/* Inner tight energy ring */}
        <Animated.View style={[styles.rippleRingInner, styleRing0]} />

        {/* Core sphere with shadow-based glow */}
        <Animated.View style={[styles.coreShadow, styleCore]}>
          {/* Glow layer using shadow only — no solid bg circle */}
          <Animated.View style={[styles.glowShadow, styleGlow]} />

          <View style={styles.coreInner}>
            <Svg height="100%" width="100%" viewBox="0 0 100 100" style={StyleSheet.absoluteFill}>
              <Defs>
                <RadialGradient
                  id="loColorGrad"
                  cx="45%"
                  cy="45%"
                  rx="55%"
                  ry="55%"
                  fx="45%"
                  fy="45%"
                >
                  <Stop offset="0%" stopColor={ACCENT_LIGHT} stopOpacity="1" />
                  <Stop offset="40%" stopColor={n.colors.accent} stopOpacity="1" />
                  <Stop offset="72%" stopColor={ACCENT_DEEP} stopOpacity="1" />
                  <Stop offset="100%" stopColor={ACCENT_DARK} stopOpacity="1" />
                </RadialGradient>
                <RadialGradient
                  id="loLightGrad"
                  cx="30%"
                  cy="28%"
                  rx="65%"
                  ry="65%"
                  fx="30%"
                  fy="28%"
                >
                  <Stop offset="0%" stopColor="#ffffff" stopOpacity="0.75" />
                  <Stop offset="30%" stopColor="#ffffff" stopOpacity="0.12" />
                  <Stop offset="60%" stopColor="#000000" stopOpacity="0.0" />
                  <Stop offset="82%" stopColor="#000000" stopOpacity="0.18" />
                  <Stop offset="100%" stopColor="#000000" stopOpacity="0.38" />
                </RadialGradient>
              </Defs>
              <Circle cx="50" cy="50" r="50" fill="url(#loColorGrad)" />
              <Circle cx="50" cy="50" r="50" fill="url(#loLightGrad)" />
            </Svg>
          </View>

          {/* Layer 4: Specular highlight */}
          <Animated.View style={[styles.specularContainer, styleHighlight]}>
            <Svg width="40%" height="25%" viewBox="0 0 40 25">
              <Defs>
                <RadialGradient id="loSpecular" cx="50%" cy="50%" rx="50%" ry="50%">
                  <Stop offset="0%" stopColor="#ffffff" stopOpacity="0.9" />
                  <Stop offset="60%" stopColor="#ffffff" stopOpacity="0.3" />
                  <Stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
                </RadialGradient>
              </Defs>
              <Ellipse cx="20" cy="12.5" rx="18" ry="10" fill="url(#loSpecular)" />
            </Svg>
          </Animated.View>
        </Animated.View>
      </View>
      {displayMessage && (
        <View
          style={{
            marginTop: 24,
            paddingHorizontal: 16,
            minHeight: 40,
            justifyContent: 'flex-start',
          }}
        >
          <LinearText variant="caption" tone="muted" centered style={{ letterSpacing: 0.5 }}>
            {displayMessage}
          </LinearText>
        </View>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  orbWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  rippleRing: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    borderRadius: 9999,
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: n.colors.accent,
    left: 0,
    top: 0,
  },
  rippleRingInner: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    borderRadius: 9999,
    backgroundColor: 'transparent',
    borderWidth: 2.5,
    borderColor: ACCENT_LIGHT,
    left: 0,
    top: 0,
  },
  coreShadow: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    borderRadius: 9999,
    backgroundColor: n.colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glowShadow: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    borderRadius: 9999,
    backgroundColor: 'transparent',
    shadowColor: n.colors.accent,
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 40,
    shadowOpacity: 1,
    elevation: 30,
  },
  coreInner: {
    width: '100%',
    height: '100%',
    borderRadius: 9999,
    overflow: 'hidden',
  },
  specularContainer: {
    position: 'absolute',
    top: '8%',
    left: '20%',
    width: '100%',
    height: '100%',
  },
});
