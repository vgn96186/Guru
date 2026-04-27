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
  runOnJS,
} from 'react-native-reanimated';
import { NativeLoadingOrbView } from '../../modules/app-launcher';

const AnimatedNativeOrb = Animated.createAnimatedComponent(NativeLoadingOrbView);
import { linearTheme as n } from '../theme/linearTheme';
import { useAppStore } from '../store/useAppStore';
import { useProfileQuery } from '../hooks/queries/useProfile';
import LinearText from './primitives/LinearText';

const PHONE_BUTTON_SIZE = 180;
const TABLET_BUTTON_SIZE = 220;
const TABLET_BREAKPOINT = 600;
const GENTLE_EASE = Easing.bezier(0.25, 0.1, 0.25, 1); // Near-linear: perceptible change at every moment
const MIN_BOOT_DISPLAY_MS = 800;
const ORB_HALF = 180 / 2; // Used for static particle styling

// ── Master calming curve ──────────────────────────────────────────
function smoothstep(t: number) {
  'worklet';
  return t * t * (3 - 2 * t);
}

function liquidSettleCurve(t: number) {
  'worklet';
  // Zero-gravity metal: loses violent energy early,
  // but keeps visible deformation for a long time.
  const early = smoothstep(Math.min(t / 0.35, 1));
  const late = smoothstep(Math.max((t - 0.35) / 0.65, 0));

  const energy = 1 - (0.55 * early + 0.45 * late);
  return Math.max(0, energy);
}

const JITTER_EXPONENT = 1.4; // positional jitter — fastest decay
// ──────────────────────────────────────────────────────────────────

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
  // Orb matches button size so settling is just a position glide, no resize
  const ORB_SIZE = targetSize;

  const bootPhase = useAppStore((s) => s.bootPhase);
  const startButtonLayout = useAppStore((s) => s.startButtonLayout);
  const startButtonLabel = useAppStore((s) => s.startButtonLabel);
  const startButtonSublabel = useAppStore((s) => s.startButtonSublabel);
  const setBootPhase = useAppStore((s) => s.setBootPhase);

  const bootStartTime = useRef(Date.now());
  const hasEnteredCalming = useRef(false);
  const hasEnteredSettling = useRef(false);

  // --- Messages ---
  const [displayMessage, setDisplayMessage] = React.useState('Guru is waking up...');

  // --- Path animation ---
  const pathTime = useSharedValue(0);
  // Linear progress 0→1; tracks the shape calming and settling
  const shapeSettleProgress = useSharedValue(0);

  const animatedOrbProps = useAnimatedProps(() => {
    const energy = liquidSettleCurve(shapeSettleProgress.value);

    return {
      pathIntensity: energy,
      breathIntensity: 0,
    };
  });

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
  const mountScale = useSharedValue(0);
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
  // Glide target — captured once at settle start so layout updates can't snap mid-animation
  const targetXShared = useSharedValue(0);
  const targetYShared = useSharedValue(0);
  const bgOpacity = useSharedValue(1);
  const loadingTextOpacity = useSharedValue(1);
  const ctaTextOpacity = useSharedValue(0);
  const shellOpacity = useSharedValue(0);
  const nativeOrbOpacity = useSharedValue(1);
  const overlayOpacity = useSharedValue(1);
  const [unmounted, setUnmounted] = React.useState(false);
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

    // Organic emergence: start invisible, scale up with a gentle overshoot
    mountProgress.value = withTiming(1, { duration: 1000, easing: Easing.out(Easing.cubic) });
    mountScale.value = withSequence(
      withTiming(0.85, { duration: 600, easing: Easing.out(Easing.cubic) }),
      withTiming(1.05, { duration: 400, easing: Easing.inOut(Easing.ease) }),
      withTiming(1, { duration: 300, easing: Easing.inOut(Easing.ease) }),
    );
    particlesOpacity.value = withDelay(900, withTiming(0.9, { duration: 600 }));

    pathTime.value = withRepeat(
      withTiming(100, { duration: 40000, easing: Easing.linear }),
      -1,
      false,
    );

    // Keep core scale and opacity stable during turbulent boot (no breathing/pulsing)
    scaleCore.value = 1;
    opacityCore.value = 1;
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

    // Stay turbulent during boot — shapeSettleProgress held at 0 so intensity stays 1.0.
    // Jitter eases slightly so orb doesn't feel chaotic forever.
    jitterDamping.value = withDelay(
      800,
      withTiming(0.6, { duration: 4000, easing: Easing.linear }),
    );

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

    const safetyTimer = setTimeout(() => {
      setBootPhase('settling');
    }, 10000);

    shapeSettleProgress.value = withTiming(0.82, { duration: 8000, easing: Easing.linear });

    // Let jitter fade out completely, do not snap it back to 1
    cancelAnimation(jitterDamping);
    jitterDamping.value = withTiming(0, {
      duration: 2600,
      easing: Easing.out(Easing.cubic),
    });

    // Fade floating particles after 2s — they're a boot-only flourish.
    const particlesTimer = setTimeout(() => {
      particlesOpacity.value = withTiming(0, { duration: 900 });
    }, 2000);

    return () => {
      clearTimeout(particlesTimer);
      clearTimeout(safetyTimer);
    };
  }, [bootPhase, setBootPhase]);

  // --- Phase 3: Settle ---
  useEffect(() => {
    if (bootPhase !== 'settling' || hasEnteredSettling.current) return;
    hasEnteredSettling.current = true;

    // Smooth, fluid easing for the glide up to the button slot
    const settleEasing = Easing.bezier(0.22, 1, 0.36, 1);

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

    // Complete the shape settling
    shapeSettleProgress.value = withTiming(1, { duration: 2400, easing: settleEasing });

    // Capture glide target NOW so any later layout updates can't snap the worklet mid-animation.
    // Fall back to center if layout still missing (orb stays put rather than snapping).
    if (startButtonLayout) {
      targetXShared.value = startButtonLayout.x + startButtonLayout.width / 2;
      targetYShared.value = startButtonLayout.y + startButtonLayout.height / 2;
    } else {
      targetXShared.value = centerX;
      targetYShared.value = centerY;
    }
    cancelAnimation(scaleCore);
    cancelAnimation(opacityCore);
    scaleCore.value = withTiming(1, { duration: 1600, easing: settleEasing });
    opacityCore.value = withTiming(1, { duration: 1600 });

    // Glide to target position — slight delay so calm→glide feels sequential
    settleProgress.value = withDelay(100, withTiming(1, { duration: 2400, easing: settleEasing }));

    bgOpacity.value = withTiming(0, { duration: 1600, easing: settleEasing });
    loadingTextOpacity.value = withTiming(0, { duration: 400 });

    // Fade in the "START" text after the orb arrives
    ctaTextOpacity.value = withDelay(800, withTiming(1, { duration: 800 }));

    cancelAnimation(highlightOpacity);
    highlightOpacity.value = withTiming(0.45, { duration: 1200 });
    cancelAnimation(highlightTranslateY);
    highlightTranslateY.value = withTiming(0, { duration: 1200 });

    const completeTimer = setTimeout(() => {
      setBootPhase('done');
    }, 2800);

    return () => clearTimeout(completeTimer);
  }, [bootPhase, startButtonLayout, setBootPhase]);

  // --- Animated styles ---
  const centerX = screenWidth / 2;
  const centerY = screenHeight / 2;

  const styleOrb = useAnimatedStyle(() => {
    const currentSize = ORB_SIZE; // Same size throughout — no resize jank
    // Read captured target from shared values — set once at settle start, never changes after.
    // Falls back to centerX/Y while still 0 (pre-settle) so orb sits centered.
    const targetX = targetXShared.value || centerX;
    const targetY = targetYShared.value || centerY;
    const currentX = interpolate(settleProgress.value, [0, 1], [centerX, targetX]);
    const currentY = interpolate(settleProgress.value, [0, 1], [centerY, targetY]);
    // Jitter uses the fastest-decaying exponent (1.4) so positional shake
    // fades before blob deformation, keeping the orb's shape alive longer.
    const p = shapeSettleProgress.value;
    const energy = liquidSettleCurve(p);
    const jitterEnergy = Math.pow(energy, JITTER_EXPONENT);
    const jitterMult = jitterEnergy * jitterDamping.value;

    return {
      position: 'absolute',
      width: currentSize,
      height: currentSize,
      borderRadius: currentSize / 2,
      left: currentX - currentSize / 2,
      top: currentY - currentSize / 2,
      transform: [
        { translateX: jitterX.value * jitterMult },
        { translateY: jitterY.value * jitterMult },
      ],
    };
  });

  const styleCore = useAnimatedStyle(() => ({
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

  const styleNativeOrb = useAnimatedStyle(() => ({
    opacity: nativeOrbOpacity.value,
    transform: [{ scale: scaleCore.value * mountScale.value }],
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

  // --- Phase 4: Fade out overlay to reveal StartButton underneath ---
  useEffect(() => {
    if (bootPhase !== 'done') return;
    overlayOpacity.value = withTiming(
      0,
      { duration: 350, easing: Easing.out(Easing.quad) },
      (finished) => {
        if (finished) runOnJS(setUnmounted)(true);
      },
    );
  }, [bootPhase]);

  const styleOverlay = useAnimatedStyle(() => ({
    opacity: overlayOpacity.value,
  }));

  if (unmounted) return null;

  return (
    <Animated.View style={[styles.overlay, styleOverlay]} pointerEvents="none">
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
            {/* The liquid orb, rendered natively via Jetpack Compose */}
            {isTurbulent ? (
              <Animated.View style={[StyleSheet.absoluteFill, styleNativeOrb]}>
                <AnimatedNativeOrb
                  isTurbulent={true}
                  animatedProps={animatedOrbProps}
                  style={{
                    position: 'absolute',
                    top: '-30%',
                    left: '-30%',
                    width: '160%',
                    height: '160%',
                  }}
                />
              </Animated.View>
            ) : (
              /* Classic profile — solid sphere natively rendered */
              <Animated.View style={[StyleSheet.absoluteFill, styleNativeOrb]}>
                <NativeLoadingOrbView
                  isTurbulent={false}
                  style={{
                    position: 'absolute',
                    top: '-20%',
                    left: '-20%',
                    width: '140%',
                    height: '140%',
                  }}
                />
              </Animated.View>
            )}

            {/* CTA text fades in over the native orb — no crossfade needed */}
            <Animated.View style={[styles.textOverlay, styleCtaText]} pointerEvents="none">
              <LinearText
                variant="body"
                tone="inverse"
                style={styles.ctaLabel}
                numberOfLines={2}
                adjustsFontSizeToFit
                minimumFontScale={0.75}
              >
                {startButtonLabel || 'START SESSION'}
              </LinearText>
              {startButtonSublabel ? (
                <LinearText
                  variant="bodySmall"
                  tone="muted"
                  style={styles.ctaSublabel}
                  numberOfLines={2}
                  adjustsFontSizeToFit
                  minimumFontScale={0.85}
                >
                  {startButtonSublabel}
                </LinearText>
              ) : null}
            </Animated.View>
          </View>
        </Animated.View>
      </Animated.View>

      <Animated.View style={[styles.textContainer, styleLoadingText]} pointerEvents="none">
        <Animated.Text style={styles.text}>{displayMessage.replace(/^\s*\+\s*/, '')}</Animated.Text>
      </Animated.View>
    </Animated.View>
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
  textOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaLabel: {
    color: '#FFF',
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
});
