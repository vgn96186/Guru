import React, { useEffect, useRef } from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedProps,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import Svg, { Defs, RadialGradient, Stop, Path } from 'react-native-svg';
import { linearTheme as n } from '../theme/linearTheme';
import LinearText from './primitives/LinearText';

// Derived accent shades for 3-D glass-sphere look
const ACCENT_LIGHT = '#9BA3EE';
const ACCENT_DEEP = '#4450C0';
const ACCENT_DARK = '#2E3BAC';
const ORB_GLOW = '#6366F1';

const AnimatedPath = Animated.createAnimatedComponent(Path);

// Simplex/Perlin noise is heavy for JS worklets.
// We'll use a combination of sine waves to approximate a 1D noise for the radius offset.
const createWavyPath = (t: number, intensity: number) => {
  'worklet';
  const cx = 50;
  const cy = 50;
  const baseR = 40;
  const points = 24;

  let d = '';

  for (let i = 0; i <= points; i++) {
    const angle = (i * Math.PI * 2) / points;

    // Use multiple sine waves of varying frequencies for a chaotic "noise" effect
    const noise =
      Math.sin(angle * 3 + t * 2) * 0.5 +
      Math.cos(angle * 5 - t * 3) * 0.3 +
      Math.sin(angle * 2 + t * 4) * 0.2;

    const currentR = baseR + noise * intensity * 10;
    const x = cx + Math.cos(angle) * currentR;
    const y = cy + Math.sin(angle) * currentR;

    if (i === 0) {
      d += `M ${x} ${y} `;
    } else {
      // Very basic spline approximation to make the blob smooth
      // A true smooth path requires control points, but for a high enough point count,
      // linear lines or basic curves suffice. We'll use a Q curve approximation.
      const prevAngle = ((i - 1) * Math.PI * 2) / points;
      const prevNoise =
        Math.sin(prevAngle * 3 + t * 2) * 0.5 +
        Math.cos(prevAngle * 5 - t * 3) * 0.3 +
        Math.sin(prevAngle * 2 + t * 4) * 0.2;
      const prevR = baseR + prevNoise * intensity * 10;
      const _px = cx + Math.cos(prevAngle) * prevR;
      const _py = cy + Math.sin(prevAngle) * prevR;

      // Control point is halfway between current and previous, pushed slightly outward
      const cpAngle = prevAngle + (angle - prevAngle) / 2;
      const cpR = (currentR + prevR) / 2 + intensity * 2;
      const cpx = cx + Math.cos(cpAngle) * cpR;
      const cpy = cy + Math.sin(cpAngle) * cpR;

      d += `Q ${cpx} ${cpy} ${x} ${y} `;
    }
  }

  return d;
};

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
  ],
  'Fetching content...': [
    'Consulting medical knowledge base...',
    'Generating study material...',
    'Preparing your next card...',
    "You're crushing this study session! 💪",
  ],
  'Loading your progress...': [
    'Syncing your study data...',
    'Calculating streak status...',
    'Tracking your medical mastery...',
  ],
  'Loading...': [
    'Thinking...',
    'Processing...',
    'Almost there...',
    'Brain loading...',
    'Stay focused...',
    'You got this, Doctor! 👨‍⚕️',
  ],
  'Guru is waking up...': ['Brewing coffee...', 'Connecting synapses...', 'Booting up...'],
};

function getRandomVariation(message: string): string {
  const variations = MESSAGE_VARIATIONS[message];
  if (!variations) return message;
  return variations[Math.floor(Math.random() * variations.length)];
}

export default React.memo(function TurbulentOrb({
  message = 'Hey there! Let me think...',
  size = 180,
}: Props) {
  const [displayMessage, setDisplayMessage] = React.useState(message);
  const lastMessageRef = useRef(message);

  useEffect(() => {
    if (lastMessageRef.current !== message) {
      lastMessageRef.current = message;
      queueMicrotask(() => setDisplayMessage(getRandomVariation(message)));
    }
    const interval = setInterval(() => setDisplayMessage(getRandomVariation(message)), 3000);
    return () => clearInterval(interval);
  }, [message]);

  const time = useSharedValue(0);
  const intensity = useSharedValue(1); // Starts turbulent (1) and settles to (0.1)

  useEffect(() => {
    // Continuous time drift for fluid motion
    time.value = withRepeat(withTiming(100, { duration: 50000, easing: Easing.linear }), -1, false);

    // Initial 15-second fluid bridge: highly turbulent -> settles down to smooth flow
    intensity.value = withTiming(0.1, { duration: 15000, easing: Easing.bezier(0.25, 1, 0.5, 1) });
  }, [intensity, time]);

  const animatedProps = useAnimatedProps(() => {
    return {
      d: createWavyPath(time.value, intensity.value),
    };
  });

  const animatedGlowProps = useAnimatedProps(() => {
    // Glow expands slightly more than the base orb
    return {
      d: createWavyPath(time.value, intensity.value * 1.2),
    };
  });

  return (
    <View style={styles.container}>
      <View style={[styles.orbWrapper, { width: size, height: size }]}>
        <Svg
          height="140%"
          width="140%"
          viewBox="0 0 100 100"
          style={{ position: 'absolute', top: '-20%', left: '-20%' }}
        >
          <Defs>
            <RadialGradient id="gradGlow" cx="50%" cy="50%" rx="50%" ry="50%">
              <Stop offset="0%" stopColor={ORB_GLOW} stopOpacity="0.4" />
              <Stop offset="70%" stopColor={ORB_GLOW} stopOpacity="0.1" />
              <Stop offset="100%" stopColor={ORB_GLOW} stopOpacity="0" />
            </RadialGradient>
            <RadialGradient id="gradCore" cx="40%" cy="40%" rx="60%" ry="60%">
              <Stop offset="0%" stopColor={ACCENT_LIGHT} stopOpacity="1" />
              <Stop offset="40%" stopColor={n.colors.accent} stopOpacity="1" />
              <Stop offset="80%" stopColor={ACCENT_DEEP} stopOpacity="1" />
              <Stop offset="100%" stopColor={ACCENT_DARK} stopOpacity="1" />
            </RadialGradient>
          </Defs>

          {/* Expanded Glow Layer */}
          <AnimatedPath animatedProps={animatedGlowProps} fill="url(#gradGlow)" />

          {/* Core Fluid Layer */}
          <AnimatedPath animatedProps={animatedProps} fill="url(#gradCore)" />
        </Svg>
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
});
