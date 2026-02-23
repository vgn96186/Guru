import React, { useEffect, useRef } from 'react';
import { Animated, View, Text, StyleSheet } from 'react-native';

interface Props {
  message?: string;
}

const MESSAGE_VARIATIONS: Record<string, string[]> = {
  'Guru is planning your session...': ['Analyzing your weak topics...', 'Selecting optimal content...', 'Building your study agenda...'],
  'Fetching content...': ['Consulting medical knowledge base...', 'Generating study material...', 'Preparing your next card...'],
  'Loading your progress...': ['Syncing your study data...', 'Calculating streak status...', 'Preparing dashboard...'],
  'Loading...': ['Thinking...', 'Processing...', 'Almost there...'],
};

function getRandomVariation(message: string): string {
  const variations = MESSAGE_VARIATIONS[message];
  if (!variations) return message;
  return variations[Math.floor(Math.random() * variations.length)];
}

export default function LoadingOrb({ message = 'Hey there! Let me think...' }: Props) {
  const [displayMessage, setDisplayMessage] = React.useState(message);
  const scale = useRef(new Animated.Value(0.8)).current;
  const opacity = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    setDisplayMessage(getRandomVariation(message));
    const interval = setInterval(() => {
      setDisplayMessage(getRandomVariation(message));
    }, 3000);
    return () => clearInterval(interval);
  }, [message]);

  useEffect(() => {
    const anim = Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(scale, { toValue: 1.2, duration: 700, useNativeDriver: true }),
          Animated.timing(scale, { toValue: 0.8, duration: 700, useNativeDriver: true }),
        ]),
        Animated.sequence([
          Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0.4, duration: 700, useNativeDriver: true }),
        ]),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, []);

  return (
    <View style={styles.container}>
      <Animated.View style={[styles.orb, { transform: [{ scale }], opacity }]} />
      <Text style={styles.text}>{displayMessage}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', justifyContent: 'center', padding: 32 },
  orb: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#6C63FF',
    shadowColor: '#6C63FF',
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 20,
    shadowOpacity: 0.8,
    elevation: 10,
    marginBottom: 20,
  },
  text: { color: '#9E9E9E', fontSize: 14, fontStyle: 'italic' },
});
