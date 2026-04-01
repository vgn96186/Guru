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
import { theme } from '../constants/theme';

interface Props {
  message?: string;
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
  "You're building an amazing medical brain! 🧠",
  'Every study session makes you a better doctor 💙',
  'Your dedication is inspiring! Keep going! ✨',
  "Medical knowledge loading... you're almost there! 📚",
  "Stay focused, Doctor! You're making progress! 🎯",
];

function getRandomVariation(message: string): string {
  if (Math.random() < 0.2) {
    return MOTIVATIONAL_MESSAGES[Math.floor(Math.random() * MOTIVATIONAL_MESSAGES.length)];
  }

  const variations = MESSAGE_VARIATIONS[message];
  if (!variations) return message;
  return variations[Math.floor(Math.random() * variations.length)];
}

export default React.memo(function LoadingOrb({ message = 'Hey there! Let me think...' }: Props) {
  const [displayMessage, setDisplayMessage] = React.useState(message);
  const lastMessageRef = useRef(message);

  useEffect(() => {
    if (lastMessageRef.current !== message) {
      setDisplayMessage(getRandomVariation(message));
      lastMessageRef.current = message;
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
  const scaleGlow = useSharedValue(0.97);
  const opacityGlow = useSharedValue(0.12);

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

  // Text
  const textOpacity = useSharedValue(1);

  useEffect(() => {
    const coreConfig = { duration: 1800, easing: Easing.inOut(Easing.ease) };
    const emitConfig = { duration: 3500, easing: Easing.out(Easing.quad) };

    // Core breathing
    scaleCore.value = withRepeat(withTiming(1.08, coreConfig), -1, true);
    opacityCore.value = withRepeat(withTiming(1, coreConfig), -1, true);

    // Ambient glow — synced to core, subtler range
    scaleGlow.value = withRepeat(withTiming(1.04, coreConfig), -1, true);
    opacityGlow.value = withRepeat(withTiming(0.2, coreConfig), -1, true);

    // Ring 1 — inner ripple
    scaleRing1.value = withDelay(0, withRepeat(withTiming(3.0, emitConfig), -1, false));
    opacityRing1.value = withDelay(0, withRepeat(withTiming(0, emitConfig), -1, false));

    // Ring 2 — mid ripple
    scaleRing2.value = withDelay(1200, withRepeat(withTiming(4.5, emitConfig), -1, false));
    opacityRing2.value = withDelay(1200, withRepeat(withTiming(0, emitConfig), -1, false));

    // Ring 3 — outer ripple
    scaleRing3.value = withDelay(
      2400,
      withRepeat(withTiming(6.5, { ...emitConfig, duration: 4000 }), -1, false),
    );
    opacityRing3.value = withDelay(
      2400,
      withRepeat(withTiming(0, { ...emitConfig, duration: 4000 }), -1, false),
    );

    // Specular highlight — subtle shift synced to breathing
    highlightTranslateY.value = withRepeat(withTiming(2, coreConfig), -1, true);
    highlightOpacity.value = withRepeat(withTiming(0.55, coreConfig), -1, true);

    // Text — gentle fade only, no scale
    textOpacity.value = withRepeat(withTiming(0.85, { duration: 2000 }), -1, true);
  }, [
    scaleCore,
    opacityCore,
    scaleGlow,
    opacityGlow,
    scaleRing1,
    scaleRing2,
    scaleRing3,
    opacityRing1,
    opacityRing2,
    opacityRing3,
    highlightTranslateY,
    highlightOpacity,
    textOpacity,
  ]);

  const styleCore = useAnimatedStyle(() => ({
    transform: [{ scale: scaleCore.value }],
    opacity: opacityCore.value,
  }));

  const styleGlow = useAnimatedStyle(() => ({
    transform: [{ scale: scaleGlow.value }],
    opacity: opacityGlow.value,
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

  const styleText = useAnimatedStyle(() => ({
    opacity: textOpacity.value,
  }));

  return (
    <View style={styles.container}>
      <View style={styles.orbContainer}>
        {/* Layer 1: Ambient glow */}
        <Animated.View style={[styles.ambientGlow, styleGlow]} />

        {/* Layer 2: Ripple rings (thin strokes) */}
        <Animated.View style={[styles.rippleRing, styleRing3]} />
        <Animated.View style={[styles.rippleRing, styleRing2]} />
        <Animated.View style={[styles.rippleRing, styleRing1]} />

        {/* Layer 3: Core sphere */}
        <Animated.View style={[styles.coreShadow, styleCore]}>
          <View style={styles.coreInner}>
            <Svg
              height={ORB_SIZE}
              width={ORB_SIZE}
              viewBox="0 0 100 100"
              style={StyleSheet.absoluteFill}
            >
              <Defs>
                {/* Color gradient: primaryLight center -> primaryDark edge */}
                <RadialGradient
                  id="colorGrad"
                  cx="45%"
                  cy="45%"
                  rx="55%"
                  ry="55%"
                  fx="45%"
                  fy="45%"
                >
                  <Stop offset="0%" stopColor={theme.colors.primaryLight} stopOpacity="1" />
                  <Stop offset="60%" stopColor={theme.colors.primary} stopOpacity="1" />
                  <Stop offset="100%" stopColor={theme.colors.primaryDark} stopOpacity="1" />
                </RadialGradient>
                {/* Lighting gradient: white highlight top-left, dark rim bottom-right */}
                <RadialGradient
                  id="lightGrad"
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
              <Circle cx="50" cy="50" r="50" fill="url(#colorGrad)" />
              <Circle cx="50" cy="50" r="50" fill="url(#lightGrad)" />
            </Svg>
          </View>

          {/* Layer 4: Specular highlight */}
          <Animated.View style={[styles.specularContainer, styleHighlight]}>
            <Svg width={40} height={25} viewBox="0 0 40 25">
              <Defs>
                <RadialGradient id="specular" cx="50%" cy="50%" rx="50%" ry="50%">
                  <Stop offset="0%" stopColor="#ffffff" stopOpacity="0.9" />
                  <Stop offset="60%" stopColor="#ffffff" stopOpacity="0.3" />
                  <Stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
                </RadialGradient>
              </Defs>
              <Ellipse cx="20" cy="12.5" rx="18" ry="10" fill="url(#specular)" />
            </Svg>
          </Animated.View>
        </Animated.View>
      </View>
      <Animated.Text style={[styles.text, styleText]}>
        {displayMessage.replace(/^\s*\+\s*/, '')}
      </Animated.Text>
    </View>
  );
});

const ORB_SIZE = 180;
const GLOW_SIZE = ORB_SIZE * 2;

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  orbContainer: {
    width: ORB_SIZE * 7,
    height: ORB_SIZE * 7,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  ambientGlow: {
    position: 'absolute',
    width: GLOW_SIZE,
    height: GLOW_SIZE,
    borderRadius: GLOW_SIZE / 2,
    backgroundColor: theme.colors.primary,
  },
  rippleRing: {
    position: 'absolute',
    width: ORB_SIZE,
    height: ORB_SIZE,
    borderRadius: ORB_SIZE / 2,
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: theme.colors.primary,
  },
  coreShadow: {
    position: 'absolute',
    width: ORB_SIZE,
    height: ORB_SIZE,
    borderRadius: ORB_SIZE / 2,
    backgroundColor: theme.colors.primary,
    shadowColor: theme.colors.primary,
    shadowOffset: { width: 0, height: 15 },
    shadowRadius: 30,
    shadowOpacity: 0.7,
    elevation: 20,
  },
  coreInner: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: ORB_SIZE / 2,
    overflow: 'hidden',
  },
  specularContainer: {
    position: 'absolute',
    top: ORB_SIZE * 0.15,
    left: ORB_SIZE * 0.18,
  },
  text: {
    color: theme.colors.textMuted,
    fontSize: 16,
    fontStyle: 'italic',
    fontWeight: '500',
    letterSpacing: 0.5,
  },
});
