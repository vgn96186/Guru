import { Animated, Easing } from 'react-native';

export const screenEnterTiming = { duration: 240 } as const;
export const screenSettleTiming = { duration: 160 } as const;
export const sectionEnterTiming = { duration: 180 } as const;
export const sectionStaggerMs = 50;
export const cardPressTiming = { in: 80, out: 150 } as const;
export const decorativeIdleDelayMs = 320;

export const SCREEN_MOTION_TRIGGERS = ['first-mount', 'focus-settle', 'manual'] as const;
export type ScreenMotionTrigger = (typeof SCREEN_MOTION_TRIGGERS)[number];

// --- Motion preset kit (patch 09) ------------------------------------------
//
// The ONLY public motion API. Never use Animated.timing directly in screens;
// if these three don't cover your case, add a preset here first.
//
//   enter(value)      entrance/reveal — 240ms, cubic out
//   press(value, to)  press feedback — 120ms ease inout, 0.98 scale by default
//   pulseWarn(value)  ambient warning pulse — 1800ms sin loop, respects reducedMotion

export const motion = {
  enter(value: Animated.Value, to = 1) {
    return Animated.timing(value, {
      toValue: to,
      duration: 240,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
  },

  press(value: Animated.Value, pressed: boolean) {
    return Animated.timing(value, {
      toValue: pressed ? 0.98 : 1,
      duration: pressed ? 80 : 150,
      easing: Easing.inOut(Easing.quad),
      useNativeDriver: true,
    });
  },

  pulseWarn(value: Animated.Value) {
    return Animated.loop(
      Animated.sequence([
        Animated.timing(value, {
          toValue: 1,
          duration: 1800,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: false,
        }),
        Animated.timing(value, {
          toValue: 0,
          duration: 1800,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: false,
        }),
      ]),
    );
  },

  /**
   * Declarative looped keyframe animation.
   *
   *   motion.keyframes(
   *     {
   *       flameScale: { value: flameScale, rest: 1,    frames: [1.08, 0.97, 1.03, 1]    },
   *       glowOpacity:{ value: glowOpacity, rest: 0.78, frames: [0.94, 0.62, 0.80, 0.72] },
   *     },
   *     { durations: [240, 200, 260, 820], loop: true, reducedMotion }
   *   )
   *
   * Each track names an Animated.Value, its `rest` value (used when reduced
   * motion is on), and `frames.length` target values — one per phase. The
   * preset generates Animated.parallel for each phase and wraps them in a
   * sequence (and loop, if requested).
   *
   * Returns a composite animation. Call .start() / .stop() yourself.
   *
   * When reducedMotion is true, every track is snapped to `rest` and the
   * returned object is a no-op shim with matching start/stop/reset methods.
   */
  keyframes<T extends Record<string, KeyframeTrack>>(
    tracks: T,
    opts: KeyframeOptions,
  ): Animated.CompositeAnimation {
    const { durations, loop = true, reducedMotion = false, useNativeDriver = true } = opts;

    if (reducedMotion) {
      for (const t of Object.values(tracks)) t.value.setValue(t.rest);
      return noopAnimation;
    }

    const phaseCount = durations.length;
    // Validate: every track must declare exactly `phaseCount` frames. Failing
    // loudly here beats a silent layout bug six months from now.
    for (const [name, t] of Object.entries(tracks)) {
      if (t.frames.length !== phaseCount) {
        throw new Error(
          `[motion.keyframes] track "${name}" has ${t.frames.length} frames but ${phaseCount} durations were provided`,
        );
      }
    }

    const phases = durations.map((duration, phaseIdx) =>
      Animated.parallel(
        Object.values(tracks).map(t =>
          Animated.timing(t.value, {
            toValue: t.frames[phaseIdx],
            duration,
            useNativeDriver,
          }),
        ),
      ),
    );

    const seq = Animated.sequence(phases);
    return loop ? Animated.loop(seq) : seq;
  },

  /**
   * Horizontal shake loop: [+amp, -amp, 0] each tick.
   * Use for shame/error states. Reduced-motion → no-op and snap to 0.
   *
   *   const anim = motion.shake(shakeX, { amplitude: 8, reducedMotion });
   *   anim.start();  return () => anim.stop();
   */
  shake(
    value: Animated.Value,
    opts: { amplitude: number; tickMs?: number; loop?: boolean; reducedMotion?: boolean },
  ): Animated.CompositeAnimation {
    const { amplitude, tickMs = 100, loop = true, reducedMotion = false } = opts;
    if (reducedMotion) {
      value.setValue(0);
      return noopAnimation;
    }
    const seq = Animated.sequence([
      Animated.timing(value, { toValue: amplitude,  duration: tickMs, useNativeDriver: true }),
      Animated.timing(value, { toValue: -amplitude, duration: tickMs, useNativeDriver: true }),
      Animated.timing(value, { toValue: 0,          duration: tickMs, useNativeDriver: true }),
    ]);
    return loop ? Animated.loop(seq) : seq;
  },

  /**
   * Symmetric pulse between two values: [from → to → from] on loop.
   * The general primitive — use this for scale, opacity, anything scalar.
   *
   *   motion.pulseValue(glow, { from: 1, to: 0.6, duration: 1000, reducedMotion });
   */
  pulseValue(
    value: Animated.Value,
    opts: {
      from: number;
      to: number;
      duration: number;
      loop?: boolean;
      reducedMotion?: boolean;
      useNativeDriver?: boolean;
    },
  ): Animated.CompositeAnimation {
    const { from, to, duration, loop = true, reducedMotion = false, useNativeDriver = true } = opts;
    if (reducedMotion) {
      value.setValue(from);
      return noopAnimation;
    }
    const seq = Animated.sequence([
      Animated.timing(value, { toValue: to,   duration, useNativeDriver }),
      Animated.timing(value, { toValue: from, duration, useNativeDriver }),
    ]);
    return loop ? Animated.loop(seq) : seq;
  },

  /**
   * Thin wrapper over pulseValue for the common 1 → to → 1 scale pulse.
   *
   *   motion.pulseScale(pulseAnim, { to: 1.1, duration: 500, reducedMotion });
   */
  pulseScale(
    value: Animated.Value,
    opts: { to: number; duration: number; loop?: boolean; reducedMotion?: boolean },
  ): Animated.CompositeAnimation {
    return motion.pulseValue(value, { from: 1, ...opts });
  },
} as const;

export interface KeyframeTrack {
  value: Animated.Value;
  /** Resting/reduced-motion value for this track. */
  rest: number;
  /** One target value per phase. Length must match durations.length. */
  frames: number[];
}

export interface KeyframeOptions {
  /** Phase durations in ms. Length determines how many keyframes each track needs. */
  durations: number[];
  loop?: boolean;
  reducedMotion?: boolean;
  /**
   * RN's useNativeDriver. Default true. Set false if ANY track drives a
   * non-transform prop like width/backgroundColor.
   */
  useNativeDriver?: boolean;
}

/** Matches the CompositeAnimation shape but does nothing; used for reducedMotion. */
const noopAnimation: Animated.CompositeAnimation = {
  start: (cb?: Animated.EndCallback) => cb?.({ finished: true }),
  stop: () => {},
  reset: () => {},
};
