# Unified Orb Boot Transition Design

**Date:** 2026-04-23

**Goal:** Make the app's starting screen feel like the same object as the loading blob the user sees elsewhere, while reducing the current `TurbulentOrb` stutter and making the final handoff into the home start button feel seamless.

## Problem

The current boot experience presents two different visuals:

- `TurbulentOrb` in the rest of the app is a Lottie-driven loading blob.
- `BootTransition` draws its own procedural turbulent blob, then settles into a boot-only CTA shell that only approximates the real `StartButton`.

This creates two user-facing issues:

1. The loading blob and the boot/start object do not read as the same thing.
2. The current `TurbulentOrb` stutters because it uses imperative `reset()` / `play()` segment restarts and loops by replaying segment boundaries in JS.

## User Requirements

- The loading blob should be the starting screen.
- The user should perceive the boot object and the loading blob as the same object.
- The start button should visually resolve from that same object.
- The turbulent orb stutter should be fixed while running.

## Design Summary

Use one shared orb motion system across `LoadingOrb`, `TurbulentOrb`, and `BootTransition`.

- `TurbulentOrb` becomes the canonical turbulent loading visual.
- `BootTransition` starts from that same visual instead of its separate procedural SVG blob.
- The final settled state uses the exact `StartButton` finish shell, not a boot-only imitation.

This keeps the boot screen, loading spinner, and home CTA on the same visual lineage:

`turbulent blob -> calmer orb -> exact StartButton shell`

## Chosen Approach

### 1. Canonical turbulent source

`TurbulentOrb` remains the source of truth for the loading blob.

- Keep the existing blob identity and message handling.
- Remove the stutter-causing imperative playback loop.
- Replace the repeated `onAnimationFinish -> play(start, end)` cycle with a continuous steady-state animation path.

The key requirement is that the calm/steady phase must not rely on JS repeatedly restarting a segment.

### 2. Shared final orb shell

Extract the final circular CTA visual from `StartButton` into a shared visual layer.

That shared shell should own:

- size/radius behavior
- accent fill
- lighting overlay
- glow layer
- specular highlight
- centered label/sublabel layout

`StartButton` will render that shared shell directly.

`BootTransition` will settle into that same shell with the same measured layout and text.

This removes the current "close-enough" boot CTA and makes the final frame match the real button.

### 3. Boot transition flow

`BootTransition` should have three perceptual phases:

1. **Booting**
   - render the same turbulent blob visual the user sees in `LoadingOrb`
   - keep the loading message below it

2. **Calming**
   - reduce turbulence and remove the sense of frantic motion
   - preserve the same object center and silhouette as long as possible
   - fade auxiliary effects rather than swapping visuals abruptly

3. **Settling**
   - move and scale that same object into `startButtonLayout`
   - crossfade/morph the outer visual treatment into the shared `StartButton` shell
   - fade out loading text while fading in the button label/sublabel

The transition should feel like one object becoming interactive, not one object disappearing and another appearing.

## Component Boundaries

### `src/components/TurbulentOrb.tsx`

Responsibility:

- canonical loading-blob motion
- loading message rotation
- turbulence-to-steady visual phases

Changes:

- remove the stutter-prone segment replay pattern
- expose enough control for boot usage if needed, preferably through props such as:
  - whether message is shown
  - whether it should remain in turbulent mode or settle
  - whether boot-specific timing should drive phase changes

This should stay focused on the blob itself, not on boot-screen layout.

### `src/components/StartButton.tsx`

Responsibility:

- interactive home CTA
- breathing glow/highlight motion for the steady orb state

Changes:

- extract the non-interactive visual shell into a shared internal component/helper
- preserve current public API and home-screen behavior

### `src/components/BootTransition.tsx`

Responsibility:

- full-screen boot choreography
- timing, background fade, message fade, and layout convergence into the home CTA

Changes:

- stop drawing its own separate turbulent SVG blob
- use the same turbulent orb source as `LoadingOrb`
- settle into the shared `StartButton` shell
- keep using measured `startButtonLayout`, `startButtonLabel`, and `startButtonSublabel`

## Data And Control Flow

### Start button target

The existing store-based target flow remains:

- `HomeScreen` computes CTA label/sublabel
- `HomeScreen` stores CTA text via `setStartButtonCta(...)`
- `HomeScreen` measures the hidden `StartButton` via `measureInWindow(...)`
- `BootTransition` reads `startButtonLayout`, `startButtonLabel`, and `startButtonSublabel`

This is already correct and should not be redesigned.

### Orb motion ownership

Motion ownership should be clearer than it is today:

- `TurbulentOrb` owns blob-specific animation phases
- `BootTransition` owns screen-level choreography:
  - when calming begins
  - when the object starts translating/scaling
  - when text crossfades occur

Avoid having `BootTransition` recreate blob internals itself.

## Stutter Fix

The current stutter source is the imperative Lottie control path in `TurbulentOrb`.

Symptoms:

- waits for `onAnimationLoaded`
- calls `reset()` and `play(start, end)`
- on every finish, calls `play(start, end)` again

That creates repeated segment boundaries and JS-triggered restarts.

The fix should:

- avoid continuous loop control via repeated `onAnimationFinish`
- use a steady-state animation path that can run continuously once mounted
- keep React state changes out of the per-loop hot path

Whether this is implemented through a single continuously looping steady animation, a two-asset split, or a different native-friendly playback strategy is an implementation detail. The user-facing requirement is smooth motion without visible hitching.

## Visual Matching Rules

The following must match the real `StartButton` finish state:

- circular size: `156` phone / `220` tablet
- button glow treatment
- specular highlight placement
- text container width and centering
- label/sublabel typography and shadow treatment

It is acceptable for the boot-only turbulent phase to remain more fluid and irregular than the final button. It is not acceptable for the final settled state to look like a different component family.

## Testing Strategy

### Unit tests

Add or update focused tests for:

- `TurbulentOrb` phase behavior without repeated steady-state restart callbacks
- `BootTransition` rendering the correct CTA text from store state
- shared start-button shell rendering in both `StartButton` and `BootTransition`

Jest must run with `--runInBand`.

### Type safety

Run:

- `npm run typecheck`

### Visual verification

Manual verification on device is required for this work because success is about perceived continuity.

Check:

- boot blob feels like the same object as later loading blobs
- no visible pop at turbulence-to-calm transition
- no visible pop when settling into the home CTA
- start button appearance matches the real home button

## Risks

### Shared-component overreach

If the extracted shared shell also tries to own interaction or layout, the code will become harder to reason about. Keep the shared part visual-only.

### Boot timing drift

If the boot choreography waits on too many internal orb events, startup timing may become brittle. Prefer store/layout-driven phase transitions with minimal animation callbacks.

### Regression to visual mismatch

If `BootTransition` only partially adopts `StartButton` visuals, the user will still perceive two different objects. Exact reuse is preferable to approximation.

## Acceptance Criteria

- The app starts with the same loading blob identity used elsewhere in the app.
- `TurbulentOrb` no longer visibly stutters during steady running.
- `BootTransition` no longer feels like a separate blob system.
- The final settled boot object matches the real `StartButton` finish state.
- The handoff from boot object to interactive start button feels like one continuous object becoming actionable.
