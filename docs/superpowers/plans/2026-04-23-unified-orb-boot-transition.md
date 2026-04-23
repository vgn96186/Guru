# Unified Orb Boot Transition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the loading blob, boot transition, and home start button read as one continuous object while fixing the current turbulent-orb stutter.

**Architecture:** Extract the final circular CTA shell from `StartButton` into a shared visual component, then have `BootTransition` begin from the same `TurbulentOrb` lineage and settle into that exact shell. Fix `TurbulentOrb` stutter by removing the JS-driven segment replay loop from its steady state so the blob can run continuously without visible hitching.

**Tech Stack:** React Native, Expo SDK 54, TypeScript, `lottie-react-native`, `react-native-reanimated`, `react-native-svg`, Jest (`--runInBand`)

---

## File Structure

- Create: `src/components/SharedOrbShell.tsx`
  Visual-only circular orb shell shared by `StartButton` and `BootTransition`. Owns glow, SVG fill/lighting, specular highlight, and centered CTA text.

- Modify: `src/components/StartButton.tsx`
  Replace duplicated orb-shell rendering with `SharedOrbShell` while preserving the public `StartButton` API and interactive behavior.

- Modify: `src/components/TurbulentOrb.tsx`
  Remove the current imperative Lottie restart loop, keep message rotation, and expose a stable steady-state path suitable for both loading and boot contexts.

- Modify: `src/components/BootTransition.tsx`
  Stop rendering its standalone procedural turbulent blob and use the same blob lineage as `TurbulentOrb`, then settle into `SharedOrbShell` at the measured `startButtonLayout`.

- Modify: `src/components/LoadingOrb.tsx`
  Only if needed to pass new props or reuse extracted visual helpers. Avoid behavioral drift for classic mode.

- Modify: `src/components/LoadingOrb.unit.test.tsx`
  Update tests to reflect the new `TurbulentOrb` playback behavior and shared-shell rendering assumptions.

- Create: `src/components/BootTransition.unit.test.tsx`
  Focused tests for store-driven CTA text/layout usage and shared-shell rendering during settle.

- Modify: `src/components/StartButton.unit.test.tsx`
  Add a regression test proving `StartButton` still renders through the shared shell and preserves label/sublabel behavior.

- Reference: `docs/superpowers/specs/2026-04-23-unified-orb-boot-transition-design.md`
  Use as the acceptance source while implementing.

---

### Task 1: Extract The Shared Final Orb Shell

**Files:**

- Create: `src/components/SharedOrbShell.tsx`
- Modify: `src/components/StartButton.tsx`
- Test: `src/components/StartButton.unit.test.tsx`

- [ ] **Step 1: Write the failing shared-shell regression test**

Add a focused test in `src/components/StartButton.unit.test.tsx` that proves the button still renders its label and sublabel after the shell extraction, and add one assertion that targets a stable test ID exposed by the new shared shell.

```tsx
it('renders the shared orb shell and button copy', () => {
  const { getByTestId, getByText } = render(
    <StartButton onPress={jest.fn()} label="DO NEXT TASK" sublabel="Biochemistry" />,
  );

  expect(getByTestId('shared-orb-shell')).toBeTruthy();
  expect(getByText('DO NEXT TASK')).toBeTruthy();
  expect(getByText('Biochemistry')).toBeTruthy();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
npx jest --runInBand --config jest.unit.config.js src/components/StartButton.unit.test.tsx
```

Expected: FAIL because `shared-orb-shell` does not exist yet.

- [ ] **Step 3: Create the shared visual component**

Implement `src/components/SharedOrbShell.tsx` as a visual-only component. It should:

- accept `size`, `color`, `label`, `sublabel`
- accept optional animated style props for body/glow/highlight/text
- render the current `StartButton` SVG fill/light gradients
- render the specular highlight
- render centered label/sublabel text
- expose `testID="shared-orb-shell"`

Use the existing `StartButton` visuals as the source of truth. Do not put touch handling or haptics in this file.

- [ ] **Step 4: Replace duplicated shell rendering in `StartButton`**

Update `src/components/StartButton.tsx` so it still owns:

- button press handling
- disabled/hidden behavior
- breathing animation setup

But delegates the actual orb shell rendering to `SharedOrbShell`.

- [ ] **Step 5: Run the test to verify it passes**

Run:

```bash
npx jest --runInBand --config jest.unit.config.js src/components/StartButton.unit.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/SharedOrbShell.tsx src/components/StartButton.tsx src/components/StartButton.unit.test.tsx
git commit -m "refactor: extract shared orb shell"
```

---

### Task 2: Remove Turbulent Orb Stutter

**Files:**

- Modify: `src/components/TurbulentOrb.tsx`
- Modify: `src/components/LoadingOrb.unit.test.tsx`

- [ ] **Step 1: Write the failing turbulent-orb behavior test**

Update `src/components/LoadingOrb.unit.test.tsx` so it fails if the steady state still depends on repeated `onAnimationFinish` replay behavior.

Add a test shaped like:

```tsx
it('does not require repeated finish callbacks after entering steady state', () => {
  render(<LoadingOrb />);

  const initialProps = lottieMock.mock.calls.at(-1)?.[0];
  act(() => {
    initialProps.onAnimationFinish(false);
  });

  const steadyProps = lottieMock.mock.calls.at(-1)?.[0];
  expect(steadyProps.onAnimationFinish).toBeUndefined();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
npx jest --runInBand --config jest.unit.config.js src/components/LoadingOrb.unit.test.tsx
```

Expected: FAIL because the current implementation still replays the steady segment via callback.

- [ ] **Step 3: Implement the minimal stutter fix in `TurbulentOrb`**

Refactor `src/components/TurbulentOrb.tsx` so:

- intro/turbulent entry can complete once
- steady state does not call `reset()` / `play()` on every loop
- React state changes are not part of the recurring steady-state hot path

Acceptable implementation options:

- split intro and steady-state sources
- use separate mounted states keyed by phase
- or another native-friendly strategy

Not acceptable:

- repeated `onAnimationFinish -> play(...)` for steady-state loops

Preserve:

- existing `message` prop
- existing `size` prop
- existing message-rotation behavior

- [ ] **Step 4: Run the focused test to verify it passes**

Run:

```bash
npx jest --runInBand --config jest.unit.config.js src/components/LoadingOrb.unit.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/TurbulentOrb.tsx src/components/LoadingOrb.unit.test.tsx
git commit -m "fix: remove turbulent orb steady-state stutter"
```

---

### Task 3: Make Boot Transition Start From The Same Blob

**Files:**

- Modify: `src/components/BootTransition.tsx`
- Test: `src/components/BootTransition.unit.test.tsx`

- [ ] **Step 1: Write the failing boot-transition test**

Create `src/components/BootTransition.unit.test.tsx` with a focused test that asserts:

- `BootTransition` reads CTA text from `useAppStore`
- during settle it renders the shared shell instead of a boot-only CTA lookalike

Mock store selectors as needed and assert against `shared-orb-shell` plus CTA text.

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
npx jest --runInBand --config jest.unit.config.js src/components/BootTransition.unit.test.tsx
```

Expected: FAIL because `BootTransition` still renders its private procedural orb/CTA stack.

- [ ] **Step 3: Replace the standalone boot blob with the shared blob lineage**

Refactor `src/components/BootTransition.tsx` so that:

- the booting state uses the same turbulent blob source as `TurbulentOrb`
- the settling state renders `SharedOrbShell`
- the final shell uses `startButtonLabel`, `startButtonSublabel`, `targetSize`, and `startButtonLayout`

Keep:

- background fade
- message timing
- measured translation/scale into the home CTA location

Remove:

- the separate boot-only final CTA rendering path

- [ ] **Step 4: Keep screen choreography in `BootTransition`, not blob internals**

Ensure `BootTransition` still owns:

- when calming starts
- when loading text fades out
- when CTA text fades in
- when translation/scale into `startButtonLayout` happens

Do not move screen choreography into `TurbulentOrb`.

- [ ] **Step 5: Run the focused boot-transition test**

Run:

```bash
npx jest --runInBand --config jest.unit.config.js src/components/BootTransition.unit.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/BootTransition.tsx src/components/BootTransition.unit.test.tsx
git commit -m "feat: unify boot transition with shared orb shell"
```

---

### Task 4: Integrate The Shared Shell Cleanly With The Existing Loading Flow

**Files:**

- Modify: `src/components/LoadingOrb.tsx`
- Modify: `src/components/StartButton.tsx`
- Modify: `src/components/BootTransition.tsx`
- Modify: `src/components/TurbulentOrb.tsx`

- [ ] **Step 1: Verify whether `LoadingOrb` needs interface changes**

Read the updated `TurbulentOrb` and `BootTransition` implementations and only change `src/components/LoadingOrb.tsx` if new props are needed to support boot usage cleanly.

Constraint: do not change classic-mode behavior.

- [ ] **Step 2: Keep public component APIs stable where possible**

If additional props are necessary, prefer optional props with safe defaults rather than changing current call sites across screens.

- [ ] **Step 3: Run the combined focused tests**

Run:

```bash
npx jest --runInBand --config jest.unit.config.js src/components/StartButton.unit.test.tsx src/components/LoadingOrb.unit.test.tsx src/components/BootTransition.unit.test.tsx
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/LoadingOrb.tsx src/components/StartButton.tsx src/components/BootTransition.tsx src/components/TurbulentOrb.tsx src/components/StartButton.unit.test.tsx src/components/LoadingOrb.unit.test.tsx src/components/BootTransition.unit.test.tsx
git commit -m "refactor: align loading orb and boot transition"
```

---

### Task 5: Full Verification And Visual Check

**Files:**

- Reference: `docs/superpowers/specs/2026-04-23-unified-orb-boot-transition-design.md`

- [ ] **Step 1: Run the exact component tests**

Run:

```bash
npx jest --runInBand --config jest.unit.config.js src/components/StartButton.unit.test.tsx src/components/LoadingOrb.unit.test.tsx src/components/BootTransition.unit.test.tsx
```

Expected: all PASS.

- [ ] **Step 2: Run typecheck**

Run:

```bash
npm run typecheck
```

Expected: PASS. If unrelated repo errors appear, document them explicitly before claiming completion.

- [ ] **Step 3: Run a narrow lint pass on touched files**

Run:

```bash
./node_modules/.bin/eslint src/components/SharedOrbShell.tsx src/components/StartButton.tsx src/components/TurbulentOrb.tsx src/components/BootTransition.tsx src/components/LoadingOrb.tsx src/components/StartButton.unit.test.tsx src/components/LoadingOrb.unit.test.tsx src/components/BootTransition.unit.test.tsx
```

Expected: no errors. Warnings should be reviewed and either fixed or called out.

- [ ] **Step 4: Manual visual verification on device/emulator**

Check the following in a running app:

- boot starts from the same blob identity as loading screens
- turbulent blob no longer visibly hitches while running
- calm/settle phase does not pop
- CTA text fades in as the same object resolves into the home button
- final settled state matches the real start button

- [ ] **Step 5: Final commit**

```bash
git add src/components/SharedOrbShell.tsx src/components/StartButton.tsx src/components/TurbulentOrb.tsx src/components/BootTransition.tsx src/components/LoadingOrb.tsx src/components/StartButton.unit.test.tsx src/components/LoadingOrb.unit.test.tsx src/components/BootTransition.unit.test.tsx
git commit -m "feat: unify orb boot transition and start button"
```

---

## Notes For The Implementer

- Use `@superpowers:test-driven-development` before writing production code in each task.
- Use `@superpowers:verification-before-completion` before any completion claim.
- Keep the shared shell visual-only. Do not move button interaction concerns out of `StartButton`.
- Avoid broad refactors in `HomeScreen` or store wiring; that path is already correct.
- If the current single-source Lottie data cannot support a non-stuttering steady state, split intro and steady-state assets inside `TurbulentOrb` without exposing that complexity to callers.
