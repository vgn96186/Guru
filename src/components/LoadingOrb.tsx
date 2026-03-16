import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
} from 'react-native-reanimated';
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
};

function getRandomVariation(message: string): string {
  const variations = MESSAGE_VARIATIONS[message];
  if (!variations) return message;
  return variations[Math.floor(Math.random() * variations.length)];
}

export default React.memo(function LoadingOrb({ message = 'Hey there! Let me think...' }: Props) {
  const [displayMessage, setDisplayMessage] = React.useState(message);
  const scale = useSharedValue(0.8);
  const opacity = useSharedValue(0.4);

  useEffect(() => {
    setDisplayMessage(getRandomVariation(message));
    const interval = setInterval(() => {
      setDisplayMessage(getRandomVariation(message));
    }, 3000);
    return () => clearInterval(interval);
  }, [message]);

  useEffect(() => {
    scale.value = withRepeat(
      withSequence(
        withTiming(1.2, { duration: 1000, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.8, { duration: 1000, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );

    opacity.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1000, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.4, { duration: 1000, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );
  }, [scale, opacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  return (
    <View style={styles.container}>
      <Animated.View style={[styles.orb, animatedStyle]} />
      <Text style={styles.text}>{displayMessage}</Text>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing.xxl,
  },
  orb: {
    width: 64,
    height: 64,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.primary,
    marginBottom: theme.spacing.lg,
    ...theme.shadows.glow(theme.colors.primary),
  },
  text: {
    ...theme.typography.caption,
    fontStyle: 'italic',
    textAlign: 'center',
  },
});
