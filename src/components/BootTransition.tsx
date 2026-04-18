import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, useWindowDimensions } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withDelay,
  withSequence,
  Easing,
  cancelAnimation,
  interpolate,
} from 'react-native-reanimated';
import Svg, { Defs, RadialGradient, Stop, Circle, Ellipse } from 'react-native-svg';
import { linearTheme as n } from '../theme/linearTheme';
import { useAppStore } from '../store/useAppStore';

const ORB_SIZE = 180;
const ORB_HALF = ORB_SIZE / 2;
const PHONE_BUTTON_SIZE = 156;
const TABLET_BUTTON_SIZE = 220;
const TABLET_BREAKPOINT = 600;
const MIN_BOOT_DISPLAY_MS = 800;

// Derived accent shades for a 3-D glass-sphere look
const ACCENT_LIGHT = '#9BA3EE'; // bright inner core (~160% of accent)
const ACCENT_DEEP = '#4450C0'; // darker mid-shadow  (~80%)
const ACCENT_DARK = '#2E3BAC'; // deep indigo edge   (~60%)

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
  // Ripple rings (0 = tight inner pulse, 1-3 = expanding outer waves)
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

  // --- Phase 1: Jittery (starts on mount) ---
  useEffect(() => {
    const jitterConfig = { duration: 150, easing: Easing.inOut(Easing.ease) };
    const fastCore = { duration: 1200, easing: Easing.inOut(Easing.ease) };
    const fastEmit = { duration: 2300, easing: Easing.out(Easing.quad) };

    // Entry: sphere materialises — scale up + fade in
    mountProgress.value = withTiming(1, { duration: 650, easing: Easing.out(Easing.ease) });
    mountScale.value = withTiming(1, { duration: 850, easing: Easing.out(Easing.cubic) });

    // Particles drift in after sphere is visible
    particlesOpacity.value = withDelay(700, withTiming(0.9, { duration: 600 }));

    // Core breathing (fast / energetic during boot)
    scaleCore.value = withRepeat(withTiming(1.1, fastCore), -1, true);
    opacityCore.value = withRepeat(withTiming(1, fastCore), -1, true);
    opacityGlow.value = withRepeat(withTiming(0.7, fastCore), -1, true);

    // Inner ring: tight, fast energy pulse (starts 200 ms after mount)
    scaleRing0.value = withDelay(
      200,
      withRepeat(withTiming(1.9, { duration: 900, easing: Easing.out(Easing.quad) }), -1, false),
    );
    opacityRing0.value = withDelay(
      200,
      withRepeat(withTiming(0, { duration: 900, easing: Easing.out(Easing.quad) }), -1, false),
    );

    // Outer rings: staggered wave expansion (start after sphere appears)
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

    // Jitter starts 500 ms after mount so the sphere materialises cleanly first
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

    // Particle float oscillations (staggered phases for organic feel)
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Phase 2: Calming ---
  useEffect(() => {
    if (bootPhase !== 'calming' || hasEnteredCalming.current) return;
    hasEnteredCalming.current = true;

    const elapsed = Date.now() - bootStartTime.current;
    const delay = Math.max(0, MIN_BOOT_DISPLAY_MS - elapsed);
    let stopJitterTimer: ReturnType<typeof setTimeout> | null = null;
    const calmJitterEasing = Easing.bezier(0.22, 1, 0.36, 1);

    const safetyTimer = setTimeout(() => {
      setBootPhase('settling');
    }, 4000);

    const timer = setTimeout(() => {
      jitterDamping.value = withTiming(0, { duration: 1400, easing: calmJitterEasing });
      stopJitterTimer = setTimeout(() => {
        cancelAnimation(jitterX);
        cancelAnimation(jitterY);
        jitterX.value = 0;
        jitterY.value = 0;
      }, 1400);

      const normalCore = { duration: 1800, easing: Easing.inOut(Easing.ease) };
      const normalEmit = { duration: 3500, easing: Easing.out(Easing.quad) };

      // Particles fade out
      particlesOpacity.value = withTiming(0, { duration: 900 });

      // Glow: brief brightness flash → calm breathe
      cancelAnimation(opacityGlow);
      opacityGlow.value = withSequence(
        withTiming(0.95, { duration: 250 }),
        withTiming(0.55, { duration: 450 }),
        withRepeat(withTiming(0.5, normalCore), -1, true),
      );

      // Core: transition to calm breathing
      cancelAnimation(scaleCore);
      cancelAnimation(opacityCore);
      scaleCore.value = withDelay(50, withRepeat(withTiming(1.06, normalCore), -1, true));
      opacityCore.value = withDelay(50, withRepeat(withTiming(1, normalCore), -1, true));

      // Inner ring: slower pace
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

      // Outer rings: calmer wave speed
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
      if (stopJitterTimer) clearTimeout(stopJitterTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bootPhase]);

  // --- Phase 3: Settle ---
  useEffect(() => {
    if (bootPhase !== 'settling') return;

    const settleEasing = Easing.bezier(0.4, 0.0, 0.2, 1);

    // Cancel all ripple rings
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

    cancelAnimation(opacityGlow);
    opacityGlow.value = withTiming(0, { duration: 1200 });

    cancelAnimation(scaleCore);
    cancelAnimation(opacityCore);
    scaleCore.value = withTiming(1, { duration: 1600, easing: settleEasing });
    opacityCore.value = withTiming(1, { duration: 1600 });

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bootPhase, startButtonLayout]);

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
      position: 'absolute' as const,
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

  // mountScale multiplied in so the sphere scales up on entry
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

  const styleHighlight = useAnimatedStyle(() => ({
    transform: [{ translateY: highlightTranslateY.value }],
    opacity: highlightOpacity.value * mountProgress.value,
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
        {/* Floating energy particles (visible during boot / calming) */}
        <Animated.View style={[styles.particle, styles.particle1, styleP1]} />
        <Animated.View style={[styles.particle, styles.particle2, styleP2]} />
        <Animated.View style={[styles.particle, styles.particle3, styleP3]} />

        {/* Ripple rings — rendered back to front (outer → inner) */}
        <Animated.View style={[styles.rippleRing, styleRing3]} />
        <Animated.View style={[styles.rippleRing, styleRing2]} />
        <Animated.View style={[styles.rippleRing, styleRing1]} />
        {/* Inner tight energy ring */}
        <Animated.View style={[styles.rippleRingInner, styleRing0]} />

        {/* Core sphere with shadow-based glow */}
        <Animated.View style={[styles.coreShadow, styleCore]}>
          <Animated.View style={[styles.glowShadow, styleGlow]} />

          <View style={styles.coreInner}>
            <Svg height="100%" width="100%" viewBox="0 0 100 100" style={StyleSheet.absoluteFill}>
              <Defs>
                {/* Colour gradient: bright inner core → accent → deep indigo edge */}
                <RadialGradient
                  id="btColorGrad"
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
                {/* Lighting overlay: bright specular patch + soft rim shadow */}
                <RadialGradient
                  id="btLightGrad"
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
              <Circle cx="50" cy="50" r="50" fill="url(#btColorGrad)" />
              <Circle cx="50" cy="50" r="50" fill="url(#btLightGrad)" />
            </Svg>
          </View>

          {/* Specular highlight */}
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

          {/* CTA text (fades in during settle) */}
          <Animated.View style={[styles.ctaContainer, styleCtaText]} pointerEvents="none">
            <Animated.Text
              style={styles.ctaLabel}
              numberOfLines={2}
              adjustsFontSizeToFit
              minimumFontScale={0.75}
            >
              {startButtonLabel}
            </Animated.Text>
            {startButtonSublabel ? (
              <Animated.Text
                style={styles.ctaSublabel}
                numberOfLines={2}
                adjustsFontSizeToFit
                minimumFontScale={0.85}
              >
                {startButtonSublabel}
              </Animated.Text>
            ) : null}
          </Animated.View>
        </Animated.View>
      </Animated.View>

      {/* Loading text (below orb, fades out during settle) */}
      <Animated.View style={[styles.textContainer, styleLoadingText]} pointerEvents="none">
        <Animated.Text style={styles.text}>{displayMessage.replace(/^\s*\+\s*/, '')}</Animated.Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
  },
  background: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: n.colors.background,
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
    ...StyleSheet.absoluteFillObject,
    borderRadius: 9999,
    overflow: 'hidden',
  },
  specularContainer: {
    position: 'absolute',
    top: '15%',
    left: '18%',
  },
  ctaContainer: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    width: '90%',
  },
  ctaLabel: {
    color: n.colors.textPrimary,
    fontWeight: '900',
    fontSize: 17,
    letterSpacing: 1.2,
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.4)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  ctaSublabel: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 12,
    marginTop: 6,
    textAlign: 'center',
    lineHeight: 17,
    textShadowColor: 'rgba(0,0,0,0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  textContainer: {
    position: 'absolute',
    bottom: '30%',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  text: {
    color: n.colors.textMuted,
    fontSize: 16,
    fontStyle: 'italic',
    fontWeight: '500',
    letterSpacing: 0.5,
  },
  // Floating energy particles
  particle: {
    position: 'absolute',
    borderRadius: 9999,
    backgroundColor: n.colors.accent,
    shadowColor: n.colors.accent,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    elevation: 8,
  },
  particle1: {
    width: 8,
    height: 8,
    left: ORB_HALF + 52, // top-right edge
    top: ORB_HALF - 70,
    shadowRadius: 8,
  },
  particle2: {
    width: 6,
    height: 6,
    left: ORB_HALF - 82, // left edge
    top: ORB_HALF + 28,
    shadowRadius: 6,
  },
  particle3: {
    width: 5,
    height: 5,
    left: ORB_HALF + 64, // bottom-right edge
    top: ORB_HALF + 58,
    shadowRadius: 5,
  },
});
