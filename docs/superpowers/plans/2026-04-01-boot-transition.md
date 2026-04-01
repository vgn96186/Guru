# Boot Transition — Orb Morph to Start Button Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a seamless animated overlay where the LoadingOrb persists as a single visual element from app boot, calming from jittery energy into the StartButton on HomeScreen.

**Architecture:** A `BootTransition` component renders at App.tsx level above navigation with `position: absolute`. It owns one animated orb that transitions through 3 phases (jittery → calming → settle-to-button), coordinated via Zustand store fields (`bootPhase`, `startButtonLayout`, `startButtonLabel`). The real StartButton is hidden until the overlay completes.

**Tech Stack:** react-native-reanimated, react-native-svg, zustand, expo-haptics

---

## File Structure

| File                                | Role                                                                                                                 |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `src/components/BootTransition.tsx` | **New.** Full-screen overlay with animated orb, 3-phase logic, message text                                          |
| `src/store/useAppStore.ts`          | **Modify.** Add `bootPhase`, `startButtonLayout`, `startButtonLabel`, `startButtonSublabel`, setters                 |
| `App.tsx`                           | **Modify.** Remove LoadingOrb, render BootTransition overlay, set `bootPhase` to `'calming'`                         |
| `src/screens/HomeScreen.tsx`        | **Modify.** Remove LoadingOrb, measure StartButton position, set `bootPhase` to `'settling'`, write heroCta to store |
| `src/components/StartButton.tsx`    | **Modify.** Forward ref for measurement, accept `hidden` prop                                                        |

---

### Task 1: Add boot transition state to Zustand store

**Files:**

- Modify: `src/store/useAppStore.ts`

- [ ] **Step 1: Add types and initial state**

In `src/store/useAppStore.ts`, add the boot transition types to `AppState` and initial values:

```typescript
// Add to AppState interface (after line 57, before the closing brace):
bootPhase: 'booting' | 'calming' | 'settling' | 'done';
startButtonLayout: { x: number; y: number; width: number; height: number } | null;
startButtonLabel: string;
startButtonSublabel: string;
setBootPhase: (phase: AppState['bootPhase']) => void;
setStartButtonLayout: (layout: AppState['startButtonLayout']) => void;
setStartButtonCta: (label: string, sublabel: string) => void;
```

```typescript
// Add to the initial state inside create() (after line 137, after isRecoveringBackground):
bootPhase: 'booting' as const,
startButtonLayout: null,
startButtonLabel: 'START SESSION',
startButtonSublabel: '',
```

```typescript
// Add setters (after setRecoveringBackground, around line 138):
setBootPhase: (phase) => set({ bootPhase: phase }),
setStartButtonLayout: (layout) => set({ startButtonLayout: layout }),
setStartButtonCta: (label, sublabel) => set({ startButtonLabel: label, startButtonSublabel: sublabel }),
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | grep -i 'useAppStore\|bootPhase' | head -20`
Expected: No errors related to the new fields.

- [ ] **Step 3: Commit**

```bash
git add src/store/useAppStore.ts
git commit -m "feat: add boot transition state to Zustand store"
```

---

### Task 2: Make StartButton accept ref and hidden prop

**Files:**

- Modify: `src/components/StartButton.tsx`

- [ ] **Step 1: Convert to forwardRef and add hidden prop**

Replace the function signature and add the `hidden` prop. The component currently uses `RN Animated` (not reanimated), so we keep that pattern.

Replace the entire export/function declaration block (lines 27-34):

```typescript
const StartButton = React.forwardRef<View, Props>(function StartButton(
  {
    onPress,
    label = 'START SESSION',
    sublabel,
    color = theme.colors.primary,
    disabled = false,
    disabledLabel = 'LOADING...',
    hidden = false,
  },
  ref,
) {
```

Update the Props interface (lines 18-25):

```typescript
interface Props {
  onPress: () => void;
  label?: string;
  sublabel?: string;
  color?: string;
  disabled?: boolean;
  disabledLabel?: string;
  hidden?: boolean;
}
```

Wrap the return in an outer View with the ref and conditional opacity. Replace the return statement's outermost `<Animated.View>` (line 77):

```typescript
  return (
    <View ref={ref} collapsable={false} style={hidden ? { opacity: 0 } : undefined}>
      <Animated.View style={{ transform: [{ scale }] }}>
```

And close the extra `</View>` at the end (line 163, after `</Animated.View>`):

```typescript
      </Animated.View>
    </View>
  );
```

Update the default export at the bottom of the file:

```typescript
export default StartButton;
```

- [ ] **Step 2: Add `View` to the import from react-native (if not already there)**

Check that `View` is already imported — it is (line 5). No change needed.

Add `React` import if not present:

```typescript
import React, { useEffect, useRef } from 'react';
```

The file already imports `React` on line 1. Good.

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | grep -i 'StartButton' | head -20`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/StartButton.tsx
git commit -m "feat: StartButton accepts ref and hidden prop for boot transition"
```

---

### Task 3: Build the BootTransition overlay component

**Files:**

- Create: `src/components/BootTransition.tsx`

This is the core component. It renders a full-screen absolute overlay with the animated orb. It reads `bootPhase` from Zustand and transitions through jittery → calming → settle.

- [ ] **Step 1: Create the component file**

Create `src/components/BootTransition.tsx` with the full implementation:

```typescript
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
  runOnJS,
  interpolate,
} from 'react-native-reanimated';
import Svg, { Defs, RadialGradient, Stop, Circle, Ellipse } from 'react-native-svg';
import { theme } from '../constants/theme';
import { useAppStore } from '../store/useAppStore';

const ORB_SIZE = 180;
const GLOW_SIZE = ORB_SIZE * 2;
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
  // Core
  const scaleCore = useSharedValue(0.95);
  const opacityCore = useSharedValue(0.85);
  // Ambient glow
  const scaleGlow = useSharedValue(0.97);
  const opacityGlow = useSharedValue(0.12);
  // Rings
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
  // Settle transform
  const settleProgress = useSharedValue(0); // 0 = center/full size, 1 = at button position/size
  // Background
  const bgOpacity = useSharedValue(1);
  // Text
  const loadingTextOpacity = useSharedValue(1);
  const ctaTextOpacity = useSharedValue(0);

  // --- Phase 1: Jittery ---
  useEffect(() => {
    // Fast breathing
    const jitterConfig = { duration: 200, easing: Easing.inOut(Easing.ease) };
    const fastCore = { duration: 1200, easing: Easing.inOut(Easing.ease) };
    const fastEmit = { duration: 2300, easing: Easing.out(Easing.quad) };

    scaleCore.value = withRepeat(withTiming(1.08, fastCore), -1, true);
    opacityCore.value = withRepeat(withTiming(1, fastCore), -1, true);

    scaleGlow.value = withRepeat(withTiming(1.06, fastCore), -1, true);
    opacityGlow.value = withRepeat(withTiming(0.25, fastCore), -1, true);

    // Fast ring pulses
    scaleRing1.value = withDelay(0, withRepeat(withTiming(3.0, fastEmit), -1, false));
    opacityRing1.value = withDelay(0, withRepeat(withTiming(0, fastEmit), -1, false));
    scaleRing2.value = withDelay(800, withRepeat(withTiming(4.5, fastEmit), -1, false));
    opacityRing2.value = withDelay(800, withRepeat(withTiming(0, fastEmit), -1, false));
    scaleRing3.value = withDelay(1600, withRepeat(withTiming(6.5, { ...fastEmit, duration: 2800 }), -1, false));
    opacityRing3.value = withDelay(1600, withRepeat(withTiming(0, { ...fastEmit, duration: 2800 }), -1, false));

    highlightTranslateY.value = withRepeat(withTiming(2, fastCore), -1, true);
    highlightOpacity.value = withRepeat(withTiming(0.55, fastCore), -1, true);

    // Jitter: rapid random shake
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

    // Enforce minimum boot display time
    const elapsed = Date.now() - bootStartTime.current;
    const delay = Math.max(0, MIN_BOOT_DISPLAY_MS - elapsed);

    const timer = setTimeout(() => {
      const calmConfig = { duration: 800, easing: Easing.inOut(Easing.ease) };

      // Ease jitter to zero
      cancelAnimation(jitterX);
      cancelAnimation(jitterY);
      jitterX.value = withTiming(0, calmConfig);
      jitterY.value = withTiming(0, calmConfig);

      // Slow down breathing — restart with normal timing
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

      // Normal ring speed
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
      scaleRing3.value = withDelay(2400, withRepeat(withTiming(6.5, { ...normalEmit, duration: 4000 }), -1, false));
      opacityRing3.value = withDelay(2400, withRepeat(withTiming(0, { ...normalEmit, duration: 4000 }), -1, false));
    }, delay);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bootPhase]);

  // --- Phase 3: Settle ---
  useEffect(() => {
    if (bootPhase !== 'settling') return;
    if (!startButtonLayout) return; // wait for measurement

    const settleEasing = Easing.bezier(0.4, 0, 0.2, 1);

    // Fade rings out
    cancelAnimation(scaleRing1);
    cancelAnimation(opacityRing1);
    cancelAnimation(scaleRing2);
    cancelAnimation(opacityRing2);
    cancelAnimation(scaleRing3);
    cancelAnimation(opacityRing3);
    opacityRing1.value = withTiming(0, { duration: 400 });
    opacityRing2.value = withTiming(0, { duration: 400 });
    opacityRing3.value = withTiming(0, { duration: 400 });

    // Fade ambient glow down to button glow level
    cancelAnimation(scaleGlow);
    cancelAnimation(opacityGlow);
    opacityGlow.value = withTiming(0.08, { duration: 600 });

    // Stop core breathing — settle to steady
    cancelAnimation(scaleCore);
    cancelAnimation(opacityCore);
    scaleCore.value = withTiming(1, { duration: 600, easing: settleEasing });
    opacityCore.value = withTiming(1, { duration: 600 });

    // Animate position + size
    settleProgress.value = withTiming(1, { duration: 700, easing: settleEasing });

    // Background fade out
    bgOpacity.value = withTiming(0, { duration: 600, easing: settleEasing });

    // Text crossfade: loading out, then CTA in
    loadingTextOpacity.value = withTiming(0, { duration: 200 });
    ctaTextOpacity.value = withDelay(250, withTiming(1, { duration: 300 }));

    // Specular — adjust to match button style
    cancelAnimation(highlightTranslateY);
    highlightTranslateY.value = withTiming(0, { duration: 600 });

    // Complete after animation
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
    const targetX = startButtonLayout
      ? startButtonLayout.x + startButtonLayout.width / 2
      : centerX;
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
        { translateX: jitterX.value },
        { translateY: jitterY.value },
      ],
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

  // Don't render when done
  if (bootPhase === 'done') return null;

  return (
    <View style={styles.overlay} pointerEvents={bootPhase === 'settling' ? 'none' : 'box-none'}>
      {/* Dark background */}
      <Animated.View style={[styles.background, styleBg]} />

      {/* The single animated orb */}
      <Animated.View style={styleOrb}>
        {/* Ambient glow */}
        <Animated.View style={[styles.ambientGlow, styleGlow]} />

        {/* Ripple rings */}
        <Animated.View style={[styles.rippleRing, styleRing3]} />
        <Animated.View style={[styles.rippleRing, styleRing2]} />
        <Animated.View style={[styles.rippleRing, styleRing1]} />

        {/* Core sphere */}
        <Animated.View style={[styles.coreShadow, styleCore]}>
          <View style={styles.coreInner}>
            <Svg
              height="100%"
              width="100%"
              viewBox="0 0 100 100"
              style={StyleSheet.absoluteFill}
            >
              <Defs>
                <RadialGradient id="btColorGrad" cx="45%" cy="45%" rx="55%" ry="55%" fx="45%" fy="45%">
                  <Stop offset="0%" stopColor={theme.colors.primaryLight} stopOpacity="1" />
                  <Stop offset="60%" stopColor={theme.colors.primary} stopOpacity="1" />
                  <Stop offset="100%" stopColor={theme.colors.primaryDark} stopOpacity="1" />
                </RadialGradient>
                <RadialGradient id="btLightGrad" cx="30%" cy="28%" rx="65%" ry="65%" fx="30%" fy="28%">
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
            <Animated.Text style={styles.ctaLabel} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.75}>
              {startButtonLabel}
            </Animated.Text>
            {startButtonSublabel ? (
              <Animated.Text style={styles.ctaSublabel} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.85}>
                {startButtonSublabel}
              </Animated.Text>
            ) : null}
          </Animated.View>
        </Animated.View>
      </Animated.View>

      {/* Loading text (below orb, fades out during settle) */}
      <Animated.View
        style={[styles.textContainer, styleLoadingText]}
        pointerEvents="none"
      >
        <Animated.Text style={styles.text}>
          {displayMessage.replace(/^\s*\+\s*/, '')}
        </Animated.Text>
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
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | grep -i 'BootTransition' | head -20`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/BootTransition.tsx
git commit -m "feat: add BootTransition overlay with 3-phase orb animation"
```

---

### Task 4: Wire BootTransition into App.tsx

**Files:**

- Modify: `App.tsx`

- [ ] **Step 1: Replace LoadingOrb with BootTransition**

In `App.tsx`, replace the `LoadingOrb` import (line 8):

```typescript
import BootTransition from './src/components/BootTransition';
```

Remove the old LoadingOrb import line:

```typescript
// DELETE: import LoadingOrb from './src/components/LoadingOrb';
```

- [ ] **Step 2: Add Zustand import and calming trigger to AppShell**

Add import at the top of the file:

```typescript
import { useAppStore } from './src/store/useAppStore';
```

In the `AppShell` function, after `const { isReady, initialRoute, error } = useAppInitialization();` (line 74), add:

```typescript
const setBootPhase = useAppStore((s) => s.setBootPhase);

// Trigger calming phase when initialization completes
useEffect(() => {
  if (isReady && initialRoute !== null) {
    setBootPhase('calming');
  }
}, [isReady, initialRoute, setBootPhase]);
```

Add the `useEffect` import if not already present (it's not currently imported in App.tsx):

```typescript
import React, { useState, useEffect } from 'react';
```

- [ ] **Step 3: Change the not-ready branch to render AppContent behind the overlay**

Replace the not-ready block (lines 99-106):

```typescript
if (!isReady || initialRoute === null) {
  return (
    <SafeAreaProvider>
      <View style={styles.loadingContainer} />
      <BootTransition />
    </SafeAreaProvider>
  );
}
```

And in the ready block (lines 109-115), add BootTransition as a sibling:

```typescript
return (
  <SafeAreaProvider>
    <ErrorBoundary>
      <AppContent initialRoute={initialRoute} onFatalError={onFatalError} />
    </ErrorBoundary>
    <BootTransition />
  </SafeAreaProvider>
);
```

- [ ] **Step 4: Remove unused loadingContainer style**

The `loadingContainer` style in the StyleSheet is still used for the not-ready branch background. Keep it but simplify — it just needs flex and background:

```typescript
const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
});
```

- [ ] **Step 5: Verify TypeScript compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | grep -i 'App\.' | head -20`
Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add App.tsx
git commit -m "feat: wire BootTransition overlay into App.tsx, remove LoadingOrb"
```

---

### Task 5: Wire HomeScreen to measure StartButton and trigger settling

**Files:**

- Modify: `src/screens/HomeScreen.tsx`

- [ ] **Step 1: Add imports and refs**

Add to imports at the top of HomeScreen.tsx:

```typescript
import { useAppStore } from '../store/useAppStore';
```

The useAppStore is likely already imported — check and skip if so. Also make sure `useRef` and `useCallback` are imported from React. `View` should already be imported from react-native.

- [ ] **Step 2: Remove LoadingOrb usage**

Find the early return block (around lines 263-268):

```typescript
if (isLoading || !profile || !levelInfo) {
  return (
    <SafeAreaView style={styles.safe}>
      <LoadingOrb message="Loading progress..." />
    </SafeAreaView>
  );
}
```

Replace with a simple empty container (BootTransition handles the visual):

```typescript
if (isLoading || !profile || !levelInfo) {
  return <SafeAreaView style={styles.safe} />;
}
```

Remove the `LoadingOrb` import if it's no longer used elsewhere in this file.

- [ ] **Step 3: Add StartButton measurement and boot phase coordination**

Inside the HomeScreen component, after the `heroCta` calculation (around line 308), add:

```typescript
const bootPhase = useAppStore((s) => s.bootPhase);
const setBootPhase = useAppStore((s) => s.setBootPhase);
const setStartButtonLayout = useAppStore((s) => s.setStartButtonLayout);
const setStartButtonCta = useAppStore((s) => s.setStartButtonCta);
const startButtonRef = useRef<View>(null);

// Write CTA text to store so BootTransition can display it during morph
useEffect(() => {
  setStartButtonCta(heroCta.label, heroCta.sublabel ?? '');
}, [heroCta.label, heroCta.sublabel, setStartButtonCta]);

// When dashboard data finishes loading, trigger settling
useEffect(() => {
  if (!isLoading && bootPhase === 'calming') {
    // Small delay to let layout complete and measure
    const timer = setTimeout(() => {
      if (startButtonRef.current) {
        startButtonRef.current.measureInWindow((x, y, width, height) => {
          setStartButtonLayout({ x, y, width, height });
          setBootPhase('settling');
        });
      } else {
        // Fallback: settle without measurement (will use center)
        setBootPhase('settling');
      }
    }, 100);
    return () => clearTimeout(timer);
  }
}, [isLoading, bootPhase, setBootPhase, setStartButtonLayout]);
```

- [ ] **Step 4: Pass ref and hidden to StartButton**

Update the StartButton JSX (around line 346):

```typescript
<StartButton
  ref={startButtonRef}
  onPress={heroCta.onPress}
  label={heroCta.label}
  sublabel={heroCta.sublabel}
  hidden={bootPhase !== 'done'}
/>
```

- [ ] **Step 5: Verify TypeScript compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | grep -i 'HomeScreen' | head -20`
Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add src/screens/HomeScreen.tsx
git commit -m "feat: wire HomeScreen to measure StartButton and trigger boot settle"
```

---

### Task 6: Manual smoke test

- [ ] **Step 1: Start Metro bundler**

Run: `npm start`

- [ ] **Step 2: Test on device/emulator**

Launch the app and observe:

1. **Phase 1 (boot):** Orb appears centered on dark background, jittering with fast ring pulses
2. **Phase 2 (calming):** After DB init (~1-2s), jitter eases to zero, breathing and rings slow down
3. **Phase 3 (settle):** Once HomeScreen data loads, orb shrinks and glides to StartButton position, rings fade out, background reveals HomeScreen, CTA text appears
4. **Done:** Overlay disappears, real StartButton is tappable

Things to verify:

- No flash of white/blank between boot and home
- Orb position matches the real StartButton exactly
- The text crossfade looks smooth (loading message out, CTA in)
- Tapping the StartButton works after transition
- No jank or frame drops during animations

- [ ] **Step 3: Test CheckIn route**

If applicable, test with a fresh daily session where `initialRoute = 'CheckIn'`:

- Boot orb should stay in phase 1/2 while CheckIn is displayed
- After completing CheckIn and landing on HomeScreen, phase 3 (settle) should trigger

- [ ] **Step 4: Test fast boot**

If boot is very fast (hot reload), verify the minimum display time (~800ms) is enforced so the animation doesn't feel glitchy.

- [ ] **Step 5: Commit any tweaks**

```bash
git add -A
git commit -m "fix: tweak boot transition timing and polish"
```
