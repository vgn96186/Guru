import { ZoomIn, ZoomOut } from 'react-native-reanimated';

/**
 * Card Expand — entering / exiting layout animations for the detail screen.
 *
 * Why this approach (Reanimated 4.x):
 *  - Reanimated 4 no longer exposes `SharedTransition` / `sharedTransitionTag`.
 *    Layout animation builders (ZoomIn / ZoomOut) are the correct replacement.
 *  - `ZoomIn.springify()` compiles to a Reanimated *worklet* — every interpolation
 *    frame runs on the Reanimated UI thread via JSI, zero JS event-loop involvement.
 *  - `animation: 'none'` must be set on the navigator screen so the native-stack
 *    Fragment animation doesn't compete with the Reanimated layout animation.
 *
 * Visual contract:
 *  - Detail screen enters: starts at scale ~0.88, opacity 0  → spring to scale 1, opacity 1.
 *    Combined with the card's press-scale animation (SubjectCard), this reads as
 *    "the card blooms open into the detail view".
 *  - Detail screen exits: spring-scale back to ~0.88 and fade out (back swipe).
 *
 * Usage (TopicDetailScreen root wrapper):
 *   <Animated.View entering={cardExpandEntering} exiting={cardCollapseExiting} style={{ flex: 1 }}>
 */

const SPRING = { damping: 28, stiffness: 220, mass: 0.85 } as const;

export const cardExpandEntering = ZoomIn.springify()
  .damping(SPRING.damping)
  .stiffness(SPRING.stiffness)
  .mass(SPRING.mass);

export const cardCollapseExiting = ZoomOut.springify()
  .damping(SPRING.damping)
  .stiffness(SPRING.stiffness)
  .mass(SPRING.mass)
  .duration(200);
