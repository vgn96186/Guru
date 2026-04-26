import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, useWindowDimensions } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedProps,
  withRepeat,
  withTiming,
  withDelay,
  withSequence,
  Easing,
  cancelAnimation,
  interpolate,
} from 'react-native-reanimated';
import Svg, { Defs, RadialGradient, Stop, Circle, Ellipse, Path } from 'react-native-svg';
import { linearTheme as n } from '../theme/linearTheme';
import { useAppStore } from '../store/useAppStore';
import { useProfileQuery } from '../hooks/queries/useProfile';
import SharedOrbShell from './SharedOrbShell';

const AnimatedPath = Animated.createAnimatedComponent(Path);

const createViscousBlobPath = (
  t: number,
  intensity: number,
  layerOffset: number = 0,
  cyOffset: number = 0,
  yScale: number = 1,
) => {
  'worklet';
  const cx = 70;
  const cy = 70 + cyOffset;
  const baseR = 50;
  const N = 60;

  const pts: { x: number; y: number }[] = [];

  for (let i = 0; i < N; i++) {
    const angle = (i * Math.PI * 2) / N;
    const phase = angle + layerOffset * 5.0;
    const speed = t * (1 + layerOffset * 0.18);

    const noise =
      Math.sin(phase * 2 + speed * 0.7) * 0.5 +
      Math.sin(phase * 3 - speed * 1.1) * 0.28 +
      Math.cos(phase * 4 + speed * 1.6) * 0.12 +
      Math.sin(phase * 5 - speed * 2.0) * 0.04;

    const maxDeform = 28 - layerOffset * 5;
    const smoothNoise = noise / (1 + Math.abs(noise) * 0.12);
    const currentR = baseR - layerOffset * 2.5 + smoothNoise * intensity * maxDeform;

    pts.push({
      x: cx + Math.cos(angle) * currentR,
      y: cy + Math.sin(angle) * currentR * yScale,
    });
  }

  let d = `M ${Math.round(pts[0].x * 10) / 10} ${Math.round(pts[0].y * 10) / 10} `;
  for (let i = 0; i < N; i++) {
    const p0 = pts[(i - 1 + N) % N];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % N];
    const p3 = pts[(i + 2) % N];

    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    d += `C ${Math.round(cp1x * 10) / 10} ${Math.round(cp1y * 10) / 10} ${
      Math.round(cp2x * 10) / 10
    } ${Math.round(cp2y * 10) / 10} ${Math.round(p2.x * 10) / 10} ${Math.round(p2.y * 10) / 10} `;
  }

  return d;
};

const ORB_SIZE = 180;
const ORB_HALF = ORB_SIZE / 2;
const PHONE_BUTTON_SIZE = 156;
const TABLET_BUTTON_SIZE = 220;
const TABLET_BREAKPOINT = 600;
const MIN_BOOT_DISPLAY_MS = 800;

const MESSAGE_VARIATIONS: Record<string, string[]> = {
  'Guru is waking up...': [
    'Brewing coffee...',
    'Connecting synapses...',
    'Booting up...',
    'Organizing the syllabus...',
    'Waking up the medical expert...',
    'Initializing knowledge systems...',
  ],
  'Loading progress...': [
    'Syncing your study data...',
    'Calculating streak status...',
    'Preparing dashboard...',
    'Tracking your medical mastery...',
    'Measuring your progress...',
    'Analyzing your performance...',
  ],
};

function getRandomVariation(message: string): string {
  const variations = MESSAGE_VARIATIONS[message];
  if (!variations) return message;
  return variations[Math.floor(Math.random() * variations.length)];
}

export default function BootTransition() {
  const profileQuery = useProfileQuery();
  const profile = profileQuery?.data;
  const isTurbulent = profile ? profile.loadingOrbStyle !== 'classic' : true;

  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const isTablet = screenWidth >= TABLET_BREAKPOINT;
  const targetSize = isTablet ? TABLET_BUTTON_SIZE : PHONE_BUTTON_SIZE;

  const bootPhase = useAppStore((s) => s.bootPhase);
  const startButtonLayout = useAppStore((s) => s.startButtonLayout);
  const startButtonLabel = useAppStore((s) => s.startButtonLabel);
  const startButtonSublabel = useAppStore((s) => s.startButtonSublabel);
  const setBootPhase = useAppStore((s) => s.setBootPhase);

  const bootStartTime = useRef(Date.now());
  const hasEnteredCalming = useRef(false);

  // --- Messages ---
  const [displayMessage, setDisplayMessage] = React.useState('Guru is waking up...');

  // --- Path animation ---
  const pathTime = useSharedValue(0);
  const pathIntensity = useSharedValue(1);

  useEffect(() => {
    if (bootPhase === 'done' || bootPhase === 'calming') return;
    const msg = bootPhase === 'booting' ? 'Guru is waking up...' : 'Loading progress...';
    setDisplayMessage(getRandomVariation(msg));
    const interval = setInterval(() => {
      setDisplayMessage(getRandomVariation(msg));
    }, 3000);
    return () => clearInterval(interval);
  }, [bootPhase]);

  // --- Shared values ---
  // Entry animation
  const mountProgress = useSharedValue(0);
  const mountScale = useSharedValue(0.45);
  // Core breathing
  const scaleCore = useSharedValue(0.95);
  const opacityCore = useSharedValue(0.85);
  // Ambient glow
  const opacityGlow = useSharedValue(0.4);
  // Ripple rings
  const scaleRing0 = useSharedValue(1);
  const opacityRing0 = useSharedValue(0.7);
  const scaleRing1 = useSharedValue(1);
  const scaleRing2 = useSharedValue(1);
  const scaleRing3 = useSharedValue(1);
  const opacityRing1 = useSharedValue(0.5);
  const opacityRing2 = useSharedValue(0.3);
  const opacityRing3 = useSharedValue(0.18);
  // Specular
  const highlightTranslateY = useSharedValue(0);
  const highlightOpacity = useSharedValue(0.45);
  // Jitter
  const jitterX = useSharedValue(0);
  const jitterY = useSharedValue(0);
  const jitterDamping = useSharedValue(1);
  // Settle
  const settleProgress = useSharedValue(0);
  const bgOpacity = useSharedValue(1);
  const loadingTextOpacity = useSharedValue(1);
  const ctaTextOpacity = useSharedValue(0);
  // Floating particles
  const particlesOpacity = useSharedValue(0);
  const p1FloatY = useSharedValue(0);
  const p2FloatY = useSharedValue(6);
  const p3FloatY = useSharedValue(-4);

  // --- Phase 1: Jittery turbulent entry ---
  useEffect(() => {
    if (bootPhase !== 'booting') return;

    const jitterConfig = { duration: 150, easing: Easing.inOut(Easing.ease) };
    const fastCore = { duration: 1200, easing: Easing.inOut(Easing.ease) };
    const fastEmit = { duration: 2300, easing: Easing.out(Easing.quad) };

    mountProgress.value = withTiming(1, { duration: 650, easing: Easing.out(Easing.ease) });
    mountScale.value = withTiming(1, { duration: 850, easing: Easing.out(Easing.cubic) });
    particlesOpacity.value = withDelay(700, withTiming(0.9, { duration: 600 }));

    pathTime.value = withRepeat(
      withTiming(100, { duration: 40000, easing: Easing.linear }),
      -1,
      false,
    );

    scaleCore.value = withRepeat(withTiming(1.1, fastCore), -1, true);
    opacityCore.value = withRepeat(withTiming(1, fastCore), -1, true);
    opacityGlow.value = withRepeat(withTiming(0.7, fastCore), -1, true);

    scaleRing0.value = withDelay(
      200,
      withRepeat(withTiming(1.9, { duration: 900, easing: Easing.out(Easing.quad) }), -1, false),
    );
    opacityRing0.value = withDelay(
      200,
      withRepeat(withTiming(0, { duration: 900, easing: Easing.out(Easing.quad) }), -1, false),
    );

    scaleRing1.value = withDelay(400, withRepeat(withTiming(3.0, fastEmit), -1, false));
    opacityRing1.value = withDelay(400, withRepeat(withTiming(0, fastEmit), -1, false));
    scaleRing2.value = withDelay(1200, withRepeat(withTiming(4.5, fastEmit), -1, false));
    opacityRing2.value = withDelay(1200, withRepeat(withTiming(0, fastEmit), -1, false));
    scaleRing3.value = withDelay(
      2000,
      withRepeat(withTiming(6.5, { ...fastEmit, duration: 2800 }), -1, false),
    );
    opacityRing3.value = withDelay(
      2000,
      withRepeat(withTiming(0, { ...fastEmit, duration: 2800 }), -1, false),
    );

    highlightTranslateY.value = withRepeat(withTiming(3, fastCore), -1, true);
    highlightOpacity.value = withRepeat(withTiming(0.55, fastCore), -1, true);
    jitterDamping.value = 1;

    jitterX.value = withDelay(
      500,
      withRepeat(
        withSequence(
          withTiming(7, jitterConfig),
          withTiming(-5, jitterConfig),
          withTiming(-7, jitterConfig),
          withTiming(3, jitterConfig),
          withTiming(6, jitterConfig),
          withTiming(-4, jitterConfig),
          withTiming(-2, jitterConfig),
          withTiming(5, jitterConfig),
        ),
        -1,
        true,
      ),
    );
    jitterY.value = withDelay(
      500,
      withRepeat(
        withSequence(
          withTiming(-5, jitterConfig),
          withTiming(7, jitterConfig),
          withTiming(3, jitterConfig),
          withTiming(-7, jitterConfig),
          withTiming(-3, jitterConfig),
          withTiming(6, jitterConfig),
          withTiming(2, jitterConfig),
          withTiming(-4, jitterConfig),
        ),
        -1,
        true,
      ),
    );

    p1FloatY.value = withRepeat(
      withSequence(
        withTiming(-13, { duration: 2100, easing: Easing.inOut(Easing.ease) }),
        withTiming(13, { duration: 2100, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      false,
    );
    p2FloatY.value = withRepeat(
      withSequence(
        withTiming(10, { duration: 2500, easing: Easing.inOut(Easing.ease) }),
        withTiming(-10, { duration: 2500, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      false,
    );
    p3FloatY.value = withRepeat(
      withSequence(
        withTiming(-9, { duration: 1900, easing: Easing.inOut(Easing.ease) }),
        withTiming(9, { duration: 1900, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      false,
    );
  }, [bootPhase]);

  // --- Phase 2: Calming ---
  useEffect(() => {
    if (bootPhase !== 'calming' || hasEnteredCalming.current) return;
    hasEnteredCalming.current = true;

    const elapsed = Date.now() - bootStartTime.current;
    const delay = Math.max(0, MIN_BOOT_DISPLAY_MS - elapsed);

    const safetyTimer = setTimeout(() => {
      setBootPhase('settling');
    }, 4000);

    const timer = setTimeout(() => {
      jitterDamping.value = withTiming(0, {
        duration: 1400,
        easing: Easing.bezier(0.22, 1, 0.36, 1),
      });

      const normalCore = { duration: 1800, easing: Easing.inOut(Easing.ease) };
      const normalEmit = { duration: 3500, easing: Easing.out(Easing.quad) };

      particlesOpacity.value = withTiming(0, { duration: 900 });
      pathIntensity.value = withTiming(0.4, { duration: 1800, easing: Easing.out(Easing.quad) });

      opacityGlow.value = withSequence(
        withTiming(0.95, { duration: 250 }),
        withTiming(0.55, { duration: 450 }),
        withRepeat(withTiming(0.5, normalCore), -1, true),
      );

      cancelAnimation(scaleCore);
      cancelAnimation(opacityCore);
      scaleCore.value = withDelay(50, withRepeat(withTiming(1.06, normalCore), -1, true));
      opacityCore.value = withDelay(50, withRepeat(withTiming(1, normalCore), -1, true));

      cancelAnimation(scaleRing0);
      cancelAnimation(opacityRing0);
      scaleRing0.value = withDelay(
        100,
        withRepeat(withTiming(1.9, { duration: 1800, easing: Easing.out(Easing.quad) }), -1, false),
      );
      opacityRing0.value = withDelay(
        100,
        withRepeat(withTiming(0, { duration: 1800, easing: Easing.out(Easing.quad) }), -1, false),
      );

      cancelAnimation(scaleRing1);
      cancelAnimation(opacityRing1);
      scaleRing1.value = withDelay(100, withRepeat(withTiming(3.0, normalEmit), -1, false));
      opacityRing1.value = withDelay(100, withRepeat(withTiming(0, normalEmit), -1, false));

      cancelAnimation(scaleRing2);
      cancelAnimation(opacityRing2);
      scaleRing2.value = withDelay(1100, withRepeat(withTiming(4.5, normalEmit), -1, false));
      opacityRing2.value = withDelay(1100, withRepeat(withTiming(0, normalEmit), -1, false));

      cancelAnimation(scaleRing3);
      cancelAnimation(opacityRing3);
      scaleRing3.value = withDelay(
        2300,
        withRepeat(withTiming(6.5, { ...normalEmit, duration: 4000 }), -1, false),
      );
      opacityRing3.value = withDelay(
        2300,
        withRepeat(withTiming(0, { ...normalEmit, duration: 4000 }), -1, false),
      );
    }, delay);

    return () => {
      clearTimeout(timer);
      clearTimeout(safetyTimer);
    };
  }, [bootPhase, setBootPhase]);

  // --- Phase 3: Settle ---
  useEffect(() => {
    if (bootPhase !== 'settling') return;

    const settleEasing = Easing.bezier(0.4, 0.0, 0.2, 1);

    cancelAnimation(scaleRing0);
    cancelAnimation(opacityRing0);
    cancelAnimation(scaleRing1);
    cancelAnimation(opacityRing1);
    cancelAnimation(scaleRing2);
    cancelAnimation(opacityRing2);
    cancelAnimation(scaleRing3);
    cancelAnimation(opacityRing3);

    opacityRing0.value = withTiming(0, { duration: 800 });
    opacityRing1.value = withTiming(0, { duration: 1000 });
    opacityRing2.value = withTiming(0, { duration: 1000 });
    opacityRing3.value = withTiming(0, { duration: 1000 });
    opacityGlow.value = withTiming(0, { duration: 1200 });
    scaleCore.value = withTiming(1, { duration: 1600, easing: settleEasing });
    opacityCore.value = withTiming(1, { duration: 1600 });
    pathIntensity.value = withTiming(0, { duration: 1600, easing: Easing.inOut(Easing.quad) });

    settleProgress.value = withDelay(100, withTiming(1, { duration: 2400, easing: settleEasing }));

    bgOpacity.value = withTiming(0, { duration: 1800, easing: settleEasing });
    loadingTextOpacity.value = withTiming(0, { duration: 600 });
    ctaTextOpacity.value = withDelay(800, withTiming(1, { duration: 800 }));

    cancelAnimation(highlightOpacity);
    highlightOpacity.value = withTiming(0.45, { duration: 1600 });
    cancelAnimation(highlightTranslateY);
    highlightTranslateY.value = withTiming(0, { duration: 1600 });

    const completeTimer = setTimeout(() => {
      setBootPhase('done');
    }, 2800);

    return () => clearTimeout(completeTimer);
  }, [bootPhase, startButtonLayout, setBootPhase]);

  // --- Animated styles ---
  const centerX = screenWidth / 2;
  const centerY = screenHeight / 2;

  const styleOrb = useAnimatedStyle(() => {
    const currentSize = interpolate(settleProgress.value, [0, 1], [ORB_SIZE, targetSize]);
    const targetX = startButtonLayout ? startButtonLayout.x + startButtonLayout.width / 2 : centerX;
    const targetY = startButtonLayout
      ? startButtonLayout.y + startButtonLayout.height / 2
      : centerY;
    const currentX = interpolate(settleProgress.value, [0, 1], [centerX, targetX]);
    const currentY = interpolate(settleProgress.value, [0, 1], [centerY, targetY]);

    return {
      position: 'absolute',
      width: currentSize,
      height: currentSize,
      borderRadius: currentSize / 2,
      left: currentX - currentSize / 2,
      top: currentY - currentSize / 2,
      transform: [
        { translateX: jitterX.value * jitterDamping.value },
        { translateY: jitterY.value * jitterDamping.value },
      ],
    };
  });

  const styleCore = useAnimatedStyle(() => ({
    transform: [{ scale: scaleCore.value * mountScale.value }],
    opacity: opacityCore.value * mountProgress.value,
  }));

  const styleGlow = useAnimatedStyle(() => ({
    opacity: opacityGlow.value * mountProgress.value,
  }));

  const styleRing0 = useAnimatedStyle(() => ({
    transform: [{ scale: scaleRing0.value }],
    opacity: opacityRing0.value * mountProgress.value,
  }));

  const styleRing1 = useAnimatedStyle(() => ({
    transform: [{ scale: scaleRing1.value }],
    opacity: opacityRing1.value * mountProgress.value,
  }));

  const styleRing2 = useAnimatedStyle(() => ({
    transform: [{ scale: scaleRing2.value }],
    opacity: opacityRing2.value * mountProgress.value,
  }));

  const styleRing3 = useAnimatedStyle(() => ({
    transform: [{ scale: scaleRing3.value }],
    opacity: opacityRing3.value * mountProgress.value,
  }));

  const animatedGroundShadowProps = useAnimatedProps(() => ({
    d: createViscousBlobPath(pathTime.value, pathIntensity.value * 0.6, 0, 18, 0.3),
  }));

  const animatedGlowProps = useAnimatedProps(() => ({
    d: createViscousBlobPath(pathTime.value, pathIntensity.value * 1.15, -0.3),
  }));

  const animatedBodyProps = useAnimatedProps(() => ({
    d: createViscousBlobPath(pathTime.value, pathIntensity.value, 0),
  }));

  const animatedSubsurfaceProps = useAnimatedProps(() => ({
    d: createViscousBlobPath(pathTime.value, pathIntensity.value, 1.2),
  }));

  const animatedCausticProps = useAnimatedProps(() => ({
    d: createViscousBlobPath(pathTime.value, pathIntensity.value, 2.0),
  }));

  const animatedReflectionProps = useAnimatedProps(() => ({
    d: createViscousBlobPath(pathTime.value, pathIntensity.value, 1.5),
  }));

  const styleBg = useAnimatedStyle(() => ({
    opacity: bgOpacity.value,
  }));

  const styleLoadingText = useAnimatedStyle(() => ({
    opacity: loadingTextOpacity.value,
  }));

  const styleCtaText = useAnimatedStyle(() => ({
    opacity: ctaTextOpacity.value,
  }));

  const styleHighlight = useAnimatedStyle(() => ({
    transform: [{ translateY: highlightTranslateY.value }],
    opacity: highlightOpacity.value * mountProgress.value,
  }));

  const styleP1 = useAnimatedStyle(() => ({
    opacity: particlesOpacity.value,
    transform: [{ translateY: p1FloatY.value }],
  }));
  const styleP2 = useAnimatedStyle(() => ({
    opacity: particlesOpacity.value * 0.7,
    transform: [{ translateY: p2FloatY.value }],
  }));
  const styleP3 = useAnimatedStyle(() => ({
    opacity: particlesOpacity.value * 0.55,
    transform: [{ translateY: p3FloatY.value }],
  }));

  if (bootPhase === 'done') return null;

  return (
    <View style={styles.overlay} pointerEvents="none">
      <Animated.View style={[styles.background, styleBg]} />

      <Animated.View style={styleOrb}>
        {/* Floating energy particles (visible during boot / calming, classic mode only) */}
        {!isTurbulent && (
          <>
            <Animated.View style={[styles.particle, styles.particle1, styleP1]} />
            <Animated.View style={[styles.particle, styles.particle2, styleP2]} />
            <Animated.View style={[styles.particle, styles.particle3, styleP3]} />
          </>
        )}

        {/* Ripple rings — rendered back to front (outer → inner), classic mode only */}
        {!isTurbulent && (
          <>
            <Animated.View style={[styles.rippleRing, styleRing3]} />
            <Animated.View style={[styles.rippleRing, styleRing2]} />
            <Animated.View style={[styles.rippleRing, styleRing1]} />
            <Animated.View style={[styles.rippleRingInner, styleRing0]} />
          </>
        )}

        {/* Core sphere with shadow-based glow */}
        <Animated.View
          style={[
            styles.coreShadow,
            styleCore,
            isTurbulent && { backgroundColor: 'transparent', borderRadius: 0, overflow: 'visible' },
          ]}
        >
          {/* During boot/calming in classic mode */}
          {!isTurbulent && <Animated.View style={[styles.glowShadow, styleGlow]} />}

          <View style={[styles.coreInner, isTurbulent && { overflow: 'visible', borderRadius: 0 }]}>
            {/* During settling phase, both modes use SharedOrbShell */}
            {bootPhase === 'settling' ? (
              <SharedOrbShell
                size={targetSize}
                color={n.colors.accent}
                label={startButtonLabel}
                sublabel={startButtonSublabel}
                bodyAnimatedStyle={styleCore}
                glowAnimatedStyle={styleGlow}
                highlightAnimatedStyle={styleHighlight}
                labelAnimatedStyle={styleCtaText}
              />
            ) : isTurbulent ? (
              /* Turbulent mode - custom SVG layers */
              <Svg
                height="160%"
                width="160%"
                viewBox="0 0 140 140"
                style={{ position: 'absolute', top: '-30%', left: '-30%' }}
              >
                <Defs>
                  <RadialGradient id="orbGroundShadow" cx="50%" cy="50%" rx="50%" ry="50%">
                    <Stop offset="0%" stopColor="#1E1B4B" stopOpacity="0.55" />
                    <Stop offset="35%" stopColor="#0F0D2E" stopOpacity="0.3" />
                    <Stop offset="65%" stopColor="#000000" stopOpacity="0.12" />
                    <Stop offset="100%" stopColor="#000000" stopOpacity="0" />
                  </RadialGradient>
                  <RadialGradient id="orbGlow" cx="50%" cy="50%" rx="50%" ry="50%">
                    <Stop offset="0%" stopColor="#818CF8" stopOpacity="0.4" />
                    <Stop offset="35%" stopColor="#6366F1" stopOpacity="0.18" />
                    <Stop offset="65%" stopColor="#4F46E5" stopOpacity="0.06" />
                    <Stop offset="100%" stopColor="#4F46E5" stopOpacity="0" />
                  </RadialGradient>
                  <RadialGradient id="orbBody" cx="35%" cy="30%" rx="75%" ry="75%">
                    <Stop offset="0%" stopColor="#C7D2FE" stopOpacity="1" />
                    <Stop offset="12%" stopColor="#A5B4FC" stopOpacity="1" />
                    <Stop offset="30%" stopColor="#818CF8" stopOpacity="1" />
                    <Stop offset="50%" stopColor="#4F46E5" stopOpacity="1" />
                    <Stop offset="72%" stopColor="#3730A3" stopOpacity="1" />
                    <Stop offset="88%" stopColor="#1E1B4B" stopOpacity="1" />
                    <Stop offset="100%" stopColor="#0F0D2E" stopOpacity="1" />
                  </RadialGradient>
                  <RadialGradient id="orbAO" cx="50%" cy="85%" rx="65%" ry="40%">
                    <Stop offset="0%" stopColor="#000000" stopOpacity="0.45" />
                    <Stop offset="30%" stopColor="#000000" stopOpacity="0.2" />
                    <Stop offset="60%" stopColor="#000000" stopOpacity="0.05" />
                    <Stop offset="100%" stopColor="#000000" stopOpacity="0" />
                  </RadialGradient>
                  <RadialGradient id="orbSubsurface" cx="62%" cy="68%" rx="50%" ry="50%">
                    <Stop offset="0%" stopColor="#DDD6FE" stopOpacity="0.6" />
                    <Stop offset="20%" stopColor="#C7D2FE" stopOpacity="0.35" />
                    <Stop offset="45%" stopColor="#A5B4FC" stopOpacity="0.15" />
                    <Stop offset="70%" stopColor="#818CF8" stopOpacity="0.05" />
                    <Stop offset="100%" stopColor="#6366F1" stopOpacity="0" />
                  </RadialGradient>
                  <RadialGradient id="orbSpecular" cx="25%" cy="18%" rx="50%" ry="50%">
                    <Stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.95" />
                    <Stop offset="8%" stopColor="#F5F3FF" stopOpacity="0.8" />
                    <Stop offset="18%" stopColor="#E0E7FF" stopOpacity="0.5" />
                    <Stop offset="32%" stopColor="#C7D2FE" stopOpacity="0.2" />
                    <Stop offset="50%" stopColor="#000000" stopOpacity="0.0" />
                    <Stop offset="70%" stopColor="#000000" stopOpacity="0.12" />
                    <Stop offset="85%" stopColor="#000000" stopOpacity="0.3" />
                    <Stop offset="95%" stopColor="#000000" stopOpacity="0.5" />
                  </RadialGradient>
                  <RadialGradient id="orbFresnel" cx="50%" cy="50%" rx="50%" ry="50%">
                    <Stop offset="0%" stopColor="#FFFFFF" stopOpacity="0" />
                    <Stop offset="50%" stopColor="#FFFFFF" stopOpacity="0" />
                    <Stop offset="72%" stopColor="#C7D2FE" stopOpacity="0.06" />
                    <Stop offset="85%" stopColor="#A5B4FC" stopOpacity="0.18" />
                    <Stop offset="93%" stopColor="#A5B4FC" stopOpacity="0.35" />
                    <Stop offset="97%" stopColor="#C7D2FE" stopOpacity="0.45" />
                    <Stop offset="100%" stopColor="#E0E7FF" stopOpacity="0.2" />
                  </RadialGradient>
                  <RadialGradient id="orbCaustic" cx="70%" cy="78%" rx="45%" ry="40%">
                    <Stop offset="0%" stopColor="#EDE9FE" stopOpacity="0.65" />
                    <Stop offset="15%" stopColor="#DDD6FE" stopOpacity="0.45" />
                    <Stop offset="35%" stopColor="#C7D2FE" stopOpacity="0.25" />
                    <Stop offset="55%" stopColor="#A5B4FC" stopOpacity="0.1" />
                    <Stop offset="100%" stopColor="#818CF8" stopOpacity="0" />
                  </RadialGradient>
                  <RadialGradient id="orbReflection" cx="75%" cy="78%" rx="35%" ry="30%">
                    <Stop offset="0%" stopColor="#E0E7FF" stopOpacity="0.3" />
                    <Stop offset="25%" stopColor="#C7D2FE" stopOpacity="0.15" />
                    <Stop offset="50%" stopColor="#A5B4FC" stopOpacity="0.05" />
                    <Stop offset="100%" stopColor="#818CF8" stopOpacity="0" />
                  </RadialGradient>
                </Defs>
                {/* Layers 0-8 */}
                <AnimatedPath
                  animatedProps={animatedGroundShadowProps}
                  fill="url(#orbGroundShadow)"
                />
                <AnimatedPath animatedProps={animatedGlowProps} fill="url(#orbGlow)" />
                <AnimatedPath animatedProps={animatedBodyProps} fill="url(#orbBody)" />
                <AnimatedPath animatedProps={animatedBodyProps} fill="url(#orbAO)" />
                <AnimatedPath animatedProps={animatedSubsurfaceProps} fill="url(#orbSubsurface)" />
                <AnimatedPath animatedProps={animatedBodyProps} fill="url(#orbSpecular)" />
                <AnimatedPath animatedProps={animatedBodyProps} fill="url(#orbFresnel)" />
                <AnimatedPath animatedProps={animatedCausticProps} fill="url(#orbCaustic)" />
                <AnimatedPath animatedProps={animatedReflectionProps} fill="url(#orbReflection)" />
              </Svg>
            ) : (
              /* Classic mode - standard orb */
              <Svg height="100%" width="100%" viewBox="0 0 100 100" style={StyleSheet.absoluteFill}>
                <Defs>
                  <RadialGradient
                    id="btColorGrad"
                    cx="45%"
                    cy="45%"
                    rx="55%"
                    ry="55%"
                    fx="45%"
                    fy="45%"
                  >
                    <Stop offset="0%" stopColor={n.colors.accent} stopOpacity="1" />
                    <Stop offset="40%" stopColor={n.colors.accent} stopOpacity="1" />
                    <Stop offset="72%" stopColor={n.colors.accent} stopOpacity="1" />
                    <Stop offset="100%" stopColor={n.colors.accent} stopOpacity="1" />
                  </RadialGradient>
                  <RadialGradient
                    id="btLightGrad"
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
                <Circle cx="50" cy="50" r="50" fill="url(#btColorGrad)" />
                <Circle cx="50" cy="50" r="50" fill="url(#btLightGrad)" />
              </Svg>
            )}
          </View>

          {!isTurbulent && bootPhase !== 'settling' && (
            <Animated.View style={[styles.specularContainer, styleHighlight]}>
              <Svg width={40} height={25} viewBox="0 0 40 25">
                <Defs>
                  <RadialGradient id="btSpecular" cx="50%" cy="50%" rx="50%" ry="50%">
                    <Stop offset="0%" stopColor="#ffffff" stopOpacity="0.9" />
                    <Stop offset="60%" stopColor="#ffffff" stopOpacity="0.3" />
                    <Stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
                  </RadialGradient>
                </Defs>
                <Ellipse cx="20" cy="12.5" rx="18" ry="10" fill="url(#btSpecular)" />
              </Svg>
            </Animated.View>
          )}
        </Animated.View>
      </Animated.View>

      <Animated.View style={[styles.textContainer, styleLoadingText]} pointerEvents="none">
        <Animated.Text style={styles.text}>{displayMessage.replace(/^\s*\+\s*/, '')}</Animated.Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject, zIndex: 9999 },
  background: { ...StyleSheet.absoluteFillObject, backgroundColor: n.colors.background },
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
    borderColor: '#9BA3EE',
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
  coreInner: { ...StyleSheet.absoluteFillObject, borderRadius: 9999, overflow: 'hidden' },
  specularContainer: { position: 'absolute', top: '15%', left: '18%' },
  textContainer: { position: 'absolute', bottom: '30%', left: 0, right: 0, alignItems: 'center' },
  text: {
    color: n.colors.textMuted,
    fontSize: 16,
    fontStyle: 'italic',
    fontWeight: '500',
    letterSpacing: 0.5,
  },
  particle: {
    position: 'absolute',
    borderRadius: 9999,
    backgroundColor: n.colors.accent,
    shadowColor: n.colors.accent,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    elevation: 8,
  },
  particle1: { width: 8, height: 8, left: ORB_HALF + 52, top: ORB_HALF - 70, shadowRadius: 8 },
  particle2: { width: 6, height: 6, left: ORB_HALF - 82, top: ORB_HALF + 28, shadowRadius: 6 },
  particle3: { width: 5, height: 5, left: ORB_HALF + 64, top: ORB_HALF + 58, shadowRadius: 5 },
});
