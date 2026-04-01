# Boot Transition — Orb Morph to Start Button

## Goal

Create a seamless animated transition where the LoadingOrb persists as a single visual element from app boot through to the HomeScreen, morphing into the StartButton. The orb behaves like a person — jittery at first, gradually calming with deep breathing, and settling into a calm, ready-to-tap button.

## Architecture: Portal Overlay

A `BootTransition` component renders at the App.tsx level, absolutely positioned above all navigation. It owns one animated orb and transitions through 3 phases. Once complete, it unmounts and the real StartButton takes over.

```
App.tsx render tree:
  <SafeAreaProvider>
    <ErrorBoundary>
      <AppContent ... />         <- navigation, screens
    </ErrorBoundary>
    <BootTransition />           <- overlay, above everything
  </SafeAreaProvider>
```

## Three Phases

### Phase 1: Jittery (boot loading)

- Orb at 180px, centered on screen, opaque dark background
- Fast breathing cycle: 1200ms (vs normal 1800ms)
- Ring pulses at 1.5x normal speed
- Jitter animation: random translateX/Y shake +/-3px on a 200ms loop
- Ambient glow pulses faster
- Text: "Guru is waking up..." with message variations from LoadingOrb

### Phase 2: Calming (home data loading)

- Triggered when `bootPhase` becomes `'calming'` (useAppInitialization.isReady = true)
- Jitter amplitude eases from +/-3px to 0 over ~800ms
- Breathing cycle slows from 1200ms to 1800ms
- Ring pulse speed normalizes
- Background stays opaque (HomeScreen content not ready)
- Text: "Loading progress..."

### Phase 3: Settle (morph to StartButton)

- Triggered when `bootPhase` becomes `'settling'` (HomeScreen dashboard data loaded)
- Orb shrinks: 180px -> 156px over ~600ms (ease-in-out)
- Position animates from screen center to StartButton's measured on-screen position
- Rings fade to 0 opacity over ~400ms
- Specular highlight adjusts to match StartButton gradient style
- Text crossfades: loading message fades out, StartButton label ("DO NEXT TASK" / "START FOCUS SPRINT") fades in
- Background fades from opaque to transparent over ~600ms, revealing HomeScreen beneath
- Ambient glow transitions to StartButton's glow style
- On animation complete: set `bootPhase` to `'done'`, overlay unmounts

## Coordination via Zustand Store

New fields in `useAppStore`:

```typescript
bootPhase: 'booting' | 'calming' | 'settling' | 'done'
startButtonLayout: { x: number; y: number; width: number; height: number } | null
startButtonLabel: string
startButtonSublabel: string
```

### Phase triggers

| Transition          | Who sets it        | When                                         |
| ------------------- | ------------------ | -------------------------------------------- |
| booting -> calming  | AppShell (App.tsx) | useAppInitialization.isReady becomes true    |
| calming -> settling | HomeScreen         | useHomeDashboardData.isLoading becomes false |
| settling -> done    | BootTransition     | Settle animation completes                   |

### StartButton measurement

HomeScreen wraps StartButton in a View with `onLayout`. On layout, calls `ref.measureInWindow()` to get absolute screen coordinates and stores them in `startButtonLayout`. BootTransition reads this to know where to animate to.

HomeScreen also writes `startButtonLabel` and `startButtonSublabel` from the computed `heroCta` so the overlay can display the correct CTA text during the morph.

## Visibility Coordination

- During phases booting/calming/settling: BootTransition overlay is visible with `pointerEvents="box-none"` (passes touches through to navigation for system gestures)
- The real StartButton renders with `opacity: 0` while `bootPhase !== 'done'`
- When `bootPhase` becomes `'done'`: overlay unmounts, real StartButton becomes `opacity: 1`
- HomeScreen's own LoadingOrb usage is removed — BootTransition handles both loading states

## Animation Details

All animations use `react-native-reanimated` shared values and `withTiming`/`withSpring`.

### Jitter implementation

```
translateX = withRepeat(withTiming(random(-3, 3), { duration: 200 }), -1, true)
translateY = withRepeat(withTiming(random(-3, 3), { duration: 200 }), -1, true)
```

On phase 2 transition, animate jitter amplitude to 0.

### Settle position animation

Uses `withTiming` with duration 600ms, easing `Easing.bezier(0.4, 0, 0.2, 1)` (Material ease-in-out) to move from center to measured StartButton position.

### Text crossfade

Loading message fades out (opacity 1 -> 0, 200ms), then CTA label fades in (opacity 0 -> 1, 300ms). Sequential, not overlapping.

## Files Changed

| File                                | Change                                                                                                                                                                 |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/components/BootTransition.tsx` | New — overlay with 3-phase animated orb                                                                                                                                |
| `src/store/useAppStore.ts`          | Add bootPhase, startButtonLayout, startButtonLabel, startButtonSublabel                                                                                                |
| `App.tsx`                           | Remove LoadingOrb import/usage, render BootTransition as overlay sibling to AppContent, set bootPhase to calming when isReady                                          |
| `src/screens/HomeScreen.tsx`        | Remove LoadingOrb usage, measure StartButton position via onLayout + measureInWindow, set bootPhase to settling when data loads, write heroCta label/sublabel to store |
| `src/components/StartButton.tsx`    | Forward ref for measurement, accept hidden prop (opacity 0 while boot transition active)                                                                               |
| `src/components/LoadingOrb.tsx`     | No changes                                                                                                                                                             |

## Dependencies

No new dependencies. Uses existing:

- react-native-reanimated (shared values, withTiming, withRepeat, withSpring)
- react-native-svg (orb gradients)
- zustand (useAppStore)

## Edge Cases

- **Fast boot**: If boot + data load completes very quickly (< 500ms), phases 1-2 should still play for a minimum duration (~800ms total) so the animation doesn't feel like a glitch. BootTransition enforces a minimum display time before allowing phase transitions.
- **Tablet sizing**: Phase 3 target size should respect StartButton's tablet size (220px) when `width >= 600`.
- **StartButton not measured yet**: If settling triggers before measureInWindow completes, BootTransition waits for the layout measurement before starting the settle animation.
- **CheckIn route**: If initialRoute is 'CheckIn' instead of 'Tabs', the boot orb stays in phase 1/2 until the user completes check-in and lands on HomeScreen. The calming phase starts when navigation resolves, settling when HomeScreen loads.
