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
import { theme } from '../constants/theme';
import { useAppStore } from '../store/useAppStore';

const ORB_SIZE = 180;
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
    if (bootPhase === 'done') return;
    const msg = bootPhase === 'booting' ? 'Guru is waking up...' : 'Loading progress...';
    setDisplayMessage(getRandomVariation(msg));
    const interval = setInterval(() => {
      setDisplayMessage(getRandomVariation(msg));
    }, 3000);
    return () => clearInterval(interval);
  }, [bootPhase]);

  // --- Shared values ---
  const scaleCore = useSharedValue(0.95);
  const opacityCore = useSharedValue(0.85);
  const scaleGlow = useSharedValue(0.97);
  const opacityGlow = useSharedValue(0.12);
  const scaleRing1 = useSharedValue(1);
  const scaleRing2 = useSharedValue(1);
  const scaleRing3 = useSharedValue(1);
  const opacityRing1 = useSharedValue(0.5);
  const opacityRing2 = useSharedValue(0.3);
  const opacityRing3 = useSharedValue(0.18);
  const highlightTranslateY = useSharedValue(0);
  const highlightOpacity = useSharedValue(0.45);
  const jitterX = useSharedValue(0);
  const jitterY = useSharedValue(0);
  const settleProgress = useSharedValue(0);
  const bgOpacity = useSharedValue(1);
  const loadingTextOpacity = useSharedValue(1);
  const ctaTextOpacity = useSharedValue(0);

  // --- Phase 1: Jittery ---
  useEffect(() => {
    const jitterConfig = { duration: 200, easing: Easing.inOut(Easing.ease) };
    const fastCore = { duration: 1200, easing: Easing.inOut(Easing.ease) };
    const fastEmit = { duration: 2300, easing: Easing.out(Easing.quad) };

    scaleCore.value = withRepeat(withTiming(1.08, fastCore), -1, true);
    opacityCore.value = withRepeat(withTiming(1, fastCore), -1, true);

    scaleGlow.value = withRepeat(withTiming(1.06, fastCore), -1, true);
    opacityGlow.value = withRepeat(withTiming(0.25, fastCore), -1, true);

    scaleRing1.value = withDelay(0, withRepeat(withTiming(3.0, fastEmit), -1, false));
    opacityRing1.value = withDelay(0, withRepeat(withTiming(0, fastEmit), -1, false));
    scaleRing2.value = withDelay(800, withRepeat(withTiming(4.5, fastEmit), -1, false));
    opacityRing2.value = withDelay(800, withRepeat(withTiming(0, fastEmit), -1, false));
    scaleRing3.value = withDelay(
      1600,
      withRepeat(withTiming(6.5, { ...fastEmit, duration: 2800 }), -1, false),
    );
    opacityRing3.value = withDelay(
      1600,
      withRepeat(withTiming(0, { ...fastEmit, duration: 2800 }), -1, false),
    );

    highlightTranslateY.value = withRepeat(withTiming(2, fastCore), -1, true);
    highlightOpacity.value = withRepeat(withTiming(0.55, fastCore), -1, true);

    jitterX.value = withRepeat(
      withSequence(
        withTiming(3, jitterConfig),
        withTiming(-2, jitterConfig),
        withTiming(-3, jitterConfig),
        withTiming(1, jitterConfig),
        withTiming(2, jitterConfig),
        withTiming(-1, jitterConfig),
      ),
      -1,
      true,
    );
    jitterY.value = withRepeat(
      withSequence(
        withTiming(-2, jitterConfig),
        withTiming(3, jitterConfig),
        withTiming(1, jitterConfig),
        withTiming(-3, jitterConfig),
        withTiming(-1, jitterConfig),
        withTiming(2, jitterConfig),
      ),
      -1,
      true,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Phase 2: Calming ---
  useEffect(() => {
    if (bootPhase !== 'calming' || hasEnteredCalming.current) return;
    hasEnteredCalming.current = true;

    const elapsed = Date.now() - bootStartTime.current;
    const delay = Math.max(0, MIN_BOOT_DISPLAY_MS - elapsed);

    const timer = setTimeout(() => {
      const calmConfig = { duration: 800, easing: Easing.inOut(Easing.ease) };

      cancelAnimation(jitterX);
      cancelAnimation(jitterY);
      jitterX.value = withTiming(0, calmConfig);
      jitterY.value = withTiming(0, calmConfig);

      const normalCore = { duration: 1800, easing: Easing.inOut(Easing.ease) };
      const normalEmit = { duration: 3500, easing: Easing.out(Easing.quad) };

      cancelAnimation(scaleCore);
      cancelAnimation(opacityCore);
      scaleCore.value = withRepeat(withTiming(1.08, normalCore), -1, true);
      opacityCore.value = withRepeat(withTiming(1, normalCore), -1, true);

      cancelAnimation(scaleGlow);
      cancelAnimation(opacityGlow);
      scaleGlow.value = withRepeat(withTiming(1.04, normalCore), -1, true);
      opacityGlow.value = withRepeat(withTiming(0.2, normalCore), -1, true);

      cancelAnimation(scaleRing1);
      cancelAnimation(opacityRing1);
      scaleRing1.value = withDelay(0, withRepeat(withTiming(3.0, normalEmit), -1, false));
      opacityRing1.value = withDelay(0, withRepeat(withTiming(0, normalEmit), -1, false));

      cancelAnimation(scaleRing2);
      cancelAnimation(opacityRing2);
      scaleRing2.value = withDelay(1200, withRepeat(withTiming(4.5, normalEmit), -1, false));
      opacityRing2.value = withDelay(1200, withRepeat(withTiming(0, normalEmit), -1, false));

      cancelAnimation(scaleRing3);
      cancelAnimation(opacityRing3);
      scaleRing3.value = withDelay(
        2400,
        withRepeat(withTiming(6.5, { ...normalEmit, duration: 4000 }), -1, false),
      );
      opacityRing3.value = withDelay(
        2400,
        withRepeat(withTiming(0, { ...normalEmit, duration: 4000 }), -1, false),
      );
    }, delay);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bootPhase]);

  // --- Phase 3: Settle ---
  useEffect(() => {
    if (bootPhase !== 'settling') return;
    if (!startButtonLayout) return;

    const settleEasing = Easing.bezier(0.4, 0, 0.2, 1);

    cancelAnimation(scaleRing1);
    cancelAnimation(opacityRing1);
    cancelAnimation(scaleRing2);
    cancelAnimation(opacityRing2);
    cancelAnimation(scaleRing3);
    cancelAnimation(opacityRing3);
    opacityRing1.value = withTiming(0, { duration: 400 });
    opacityRing2.value = withTiming(0, { duration: 400 });
    opacityRing3.value = withTiming(0, { duration: 400 });

    cancelAnimation(scaleGlow);
    cancelAnimation(opacityGlow);
    opacityGlow.value = withTiming(0.08, { duration: 600 });

    cancelAnimation(scaleCore);
    cancelAnimation(opacityCore);
    scaleCore.value = withTiming(1, { duration: 600, easing: settleEasing });
    opacityCore.value = withTiming(1, { duration: 600 });

    settleProgress.value = withTiming(1, { duration: 700, easing: settleEasing });

    bgOpacity.value = withTiming(0, { duration: 600, easing: settleEasing });

    loadingTextOpacity.value = withTiming(0, { duration: 200 });
    ctaTextOpacity.value = withDelay(250, withTiming(1, { duration: 300 }));

    cancelAnimation(highlightTranslateY);
    highlightTranslateY.value = withTiming(0, { duration: 600 });

    const completeTimer = setTimeout(() => {
      setBootPhase('done');
    }, 800);

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
      transform: [{ translateX: jitterX.value }, { translateY: jitterY.value }],
    };
  });

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

  const styleBg = useAnimatedStyle(() => ({
    opacity: bgOpacity.value,
  }));

  const styleLoadingText = useAnimatedStyle(() => ({
    opacity: loadingTextOpacity.value,
  }));

  const styleCtaText = useAnimatedStyle(() => ({
    opacity: ctaTextOpacity.value,
  }));

  if (bootPhase === 'done') return null;

  return (
    <View style={styles.overlay} pointerEvents={bootPhase === 'settling' ? 'none' : 'box-none'}>
      <Animated.View style={[styles.background, styleBg]} />

      <Animated.View style={styleOrb}>
        <Animated.View style={[styles.ambientGlow, styleGlow]} />

        <Animated.View style={[styles.rippleRing, styleRing3]} />
        <Animated.View style={[styles.rippleRing, styleRing2]} />
        <Animated.View style={[styles.rippleRing, styleRing1]} />

        <Animated.View style={[styles.coreShadow, styleCore]}>
          <View style={styles.coreInner}>
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
                  <Stop offset="0%" stopColor={theme.colors.primaryLight} stopOpacity="1" />
                  <Stop offset="60%" stopColor={theme.colors.primary} stopOpacity="1" />
                  <Stop offset="100%" stopColor={theme.colors.primaryDark} stopOpacity="1" />
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
          </View>

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
    backgroundColor: theme.colors.background,
  },
  ambientGlow: {
    position: 'absolute',
    width: '200%',
    height: '200%',
    borderRadius: 9999,
    backgroundColor: theme.colors.primary,
    left: '-50%',
    top: '-50%',
  },
  rippleRing: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    borderRadius: 9999,
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: theme.colors.primary,
    left: 0,
    top: 0,
  },
  coreShadow: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    borderRadius: 9999,
    backgroundColor: theme.colors.primary,
    shadowColor: theme.colors.primary,
    shadowOffset: { width: 0, height: 15 },
    shadowRadius: 30,
    shadowOpacity: 0.7,
    elevation: 20,
    alignItems: 'center',
    justifyContent: 'center',
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
    color: theme.colors.textPrimary,
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
    color: theme.colors.textMuted,
    fontSize: 16,
    fontStyle: 'italic',
    fontWeight: '500',
    letterSpacing: 0.5,
  },
});
