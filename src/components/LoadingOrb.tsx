import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withDelay,
  Easing,
} from 'react-native-reanimated';
import Svg, { Defs, RadialGradient, Stop, Circle } from 'react-native-svg';
import { theme } from '../constants/theme';

interface Props {
  message?: string;
}

const MESSAGE_VARIATIONS: Record<string, string[]> = {
  'Guru is planning your session...': [
    'Analyzing your weak topics...',
    'Selecting optimal content...',
    'Building your study agenda...',
  ],
  'Fetching content...': [
    'Consulting medical knowledge base...',
    'Generating study material...',
    'Preparing your next card...',
  ],
  'Loading your progress...': [
    'Syncing your study data...',
    'Calculating streak status...',
    'Preparing dashboard...',
  ],
  'Loading...': ['Thinking...', 'Processing...', 'Almost there...'],
  'Guru is waking up...': [
    'Brewing coffee...',
    'Connecting synapses...',
    'Booting up...',
    'Organizing the syllabus...',
  ],
};

function getRandomVariation(message: string): string {
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

  const scaleCore = useSharedValue(0.9);
  const scaleRing1 = useSharedValue(0.9);
  const scaleRing2 = useSharedValue(0.9);

  const opacityCore = useSharedValue(0.85);
  const opacityRing1 = useSharedValue(0.4);
  const opacityRing2 = useSharedValue(0.15);

  useEffect(() => {
    const config = { duration: 1800, easing: Easing.inOut(Easing.ease) };

    scaleCore.value = withRepeat(withTiming(1.05, config), -1, true);
    opacityCore.value = withRepeat(withTiming(1, config), -1, true);

    scaleRing1.value = withDelay(400, withRepeat(withTiming(1.3, config), -1, true));
    opacityRing1.value = withDelay(400, withRepeat(withTiming(0.6, config), -1, true));

    scaleRing2.value = withDelay(800, withRepeat(withTiming(1.6, config), -1, true));
    opacityRing2.value = withDelay(800, withRepeat(withTiming(0.25, config), -1, true));
  }, [opacityCore, opacityRing1, opacityRing2, scaleCore, scaleRing1, scaleRing2]);

  const styleCore = useAnimatedStyle(() => ({
    transform: [{ scale: scaleCore.value }],
    opacity: opacityCore.value,
  }));
  const styleRing1 = useAnimatedStyle(() => ({
    transform: [{ scale: scaleRing1.value }],
    opacity: opacityRing1.value,
  }));
  const styleRing2 = useAnimatedStyle(() => ({
    transform: [{ scale: scaleRing2.value }],
    opacity: opacityRing2.value,
  }));

  return (
    <View style={styles.container}>
      <View style={styles.orbContainer}>
        <Animated.View style={[styles.ring, styleRing2]} />
        <Animated.View style={[styles.ring, styleRing1]} />

        <Animated.View style={[styles.coreShadow, styleCore]}>
          <View style={styles.coreInner}>
            <Svg
              height={ORB_SIZE}
              width={ORB_SIZE}
              viewBox="0 0 100 100"
              style={StyleSheet.absoluteFill}
            >
              <Defs>
                <RadialGradient
                  id="sphereLight"
                  cx="30%"
                  cy="30%"
                  rx="70%"
                  ry="70%"
                  fx="30%"
                  fy="30%"
                >
                  <Stop offset="0%" stopColor="#ffffff" stopOpacity="0.7" />
                  <Stop offset="40%" stopColor="#ffffff" stopOpacity="0.0" />
                  <Stop offset="80%" stopColor="#000000" stopOpacity="0.3" />
                  <Stop offset="100%" stopColor="#000000" stopOpacity="0.6" />
                </RadialGradient>
              </Defs>
              <Circle cx="50" cy="50" r="50" fill="url(#sphereLight)" />
            </Svg>
          </View>
        </Animated.View>
      </View>
      <Text style={styles.text}>{displayMessage}</Text>
    </View>
  );
});

const ORB_SIZE = 180;

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  orbContainer: {
    width: ORB_SIZE * 2.5,
    height: ORB_SIZE * 2.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  ring: {
    position: 'absolute',
    width: ORB_SIZE,
    height: ORB_SIZE,
    borderRadius: ORB_SIZE / 2,
    backgroundColor: theme.colors.primary,
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
  text: {
    color: theme.colors.textMuted,
    fontSize: 16,
    fontStyle: 'italic',
    fontWeight: '500',
    letterSpacing: 0.5,
  },
});
