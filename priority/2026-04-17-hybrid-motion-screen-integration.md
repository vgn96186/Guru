# Hybrid Motion System — Screen Integration Plan (Tasks 3–6)

> **For agentic workers:** REQUIRED SUB-SKILL: `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans`. Steps use checkbox (`- [ ]`) syntax. Each task is independently commit-able and reviewable.

**Goal:** Wire the already-built `src/motion/*` primitives into Home, Syllabus, and Guru Chat — giving each screen a first-mount entrance, a softer focus-settle on tab re-entry, staged above-the-fold reveals, and delayed decorative motion. Keep long lists, tab transitions, and existing data-loading behavior untouched.

**Tech Stack:** React Native, Expo SDK 54, TypeScript, React Navigation 7, react-native-reanimated 4, Zustand, Jest.

---

## Status Snapshot (as of 2026-04-17)

### Already landed (Tasks 1 & 2 done)

- `src/motion/presets.ts` — `screenEnterTiming`, `screenSettleTiming`, `sectionEnterTiming`, `sectionStaggerMs`, `cardPressTiming`, `decorativeIdleDelayMs`, `SCREEN_MOTION_TRIGGERS`.
- `src/motion/useReducedMotion.ts` — live OS signal via `AccessibilityInfo.isReduceMotionEnabled` + `reduceMotionChanged` listener.
- `src/motion/ScreenMotion.tsx` — default export; props `{ trigger, isFocused?, isEntryComplete?, style }`; triggers `first-mount | focus-settle | manual`; reduced-motion branch; completion timer fires `isEntryComplete` once per phase.
- `src/motion/StaggeredEntrance.tsx` — default export; props `{ index, disabled, style }`; uses `FadeIn` + translateY 12 → 0.
- `src/motion/index.ts` — barrel for presets + hook only (ScreenMotion / StaggeredEntrance imported via default from their files).
- `src/components/PageTransition.tsx` — now a thin delegate wrapping `ScreenMotion` (keeps old imports alive).
- `src/motion/presets.unit.test.ts` — covers duration bounds, stagger range, in < out, trigger set.

### Partially primed

- `src/components/SubjectCard.tsx` — already consumes `cardPressTiming` for press in/out (Task 4 UI leaf already done). No further change needed unless tests demand.
- `src/components/home/HeroCard.tsx` — accepts `entryComplete?: boolean` prop, already gates pulse loop on `entryComplete && !reducedMotion` and delays start by `decorativeIdleDelayMs`. **Caller (HomeScreen) does not yet pass `entryComplete`.**

### Not yet touched

- `src/screens/HomeScreen.tsx` — no `ScreenMotion` wrap, no `entryComplete` state, no `StaggeredEntrance` on sections.
- `src/screens/SyllabusScreen.tsx` — no `ScreenMotion`; uses its own `useSharedValue` for the progress bar (keep as-is).
- `src/screens/GuruChatScreen.tsx` — no `ScreenMotion`; heavy local animation for typing dots (keep as-is).
- `src/components/home/NextLectureSection.tsx`, `QuickStatsCard.tsx`, `AgendaItem.tsx` — no shared-motion integration yet.
- `src/motion/pressMotion.ts` — listed in original File Map but **not built**. Decision below: skip as a new file; expose press helper inline from presets only if a second screen needs it. Revisit when a third consumer appears.

### Tab navigator

- `src/navigation/TabNavigator.tsx` already pins `animation: 'none'` + `detachInactiveScreens: true` + `lazy` + `freezeOnBlur`. Do NOT change. Only add a characterization assertion to `src/navigation/tabNavigatorOptions.unit.test.ts` to pin it.

---

## File Map

### Modified

| File | Purpose |
|---|---|
| `src/screens/HomeScreen.tsx` | Wrap body in `ScreenMotion`, manage `entryComplete`, stagger header/hero/stats/first card, pass `entryComplete` into `HeroCard`. |
| `src/screens/SyllabusScreen.tsx` | Wrap body in `ScreenMotion`, stagger header/search/hero/sort/first subject cards only — never the full FlatList. |
| `src/screens/GuruChatScreen.tsx` | Wrap shell in `ScreenMotion`, stagger header/body container/composer; defer ambient motion until `entryComplete`. |
| `src/components/home/HeroCard.tsx` | (Verify only — already wired; may need tiny prop-default tightening.) |
| `src/components/home/NextLectureSection.tsx` | Optional `StaggeredEntrance` wrap when above-the-fold only. |
| `src/components/home/QuickStatsCard.tsx` | Standardize press feedback against `cardPressTiming` if a press target; no new loops. |
| `src/components/home/AgendaItem.tsx` | Standardize tap feedback against `cardPressTiming`; remove bespoke timings. |
| `src/components/SubjectCard.tsx` | (Verify only — already using `cardPressTiming`.) |
| `src/navigation/tabNavigatorOptions.unit.test.ts` | Add/keep assertions that tab performance config is unchanged. |

### Tests to run (focused)

- `src/motion/presets.unit.test.ts`
- `src/components/home/HeroCard.unit.test.tsx`
- `src/components/home/QuickStatsCard.unit.test.tsx`
- `src/components/home/AgendaItem.unit.test.tsx`
- `src/components/home/DailyAgendaSection.unit.test.tsx`
- `src/navigation/tabNavigatorOptions.unit.test.ts`
- `src/navigation/RootNavigator.unit.test.tsx`
- `src/hooks/useHomeDashboardData.unit.test.ts`

---

## Task 3 — Integrate Hybrid Motion into Home

**Why first:** Home is first-render path after cold start and after bootstrap wakeups. It also has the most decorative motion (exam-pulse, streak flame). Validating the `entryComplete` hand-off here de-risks Tasks 4 and 5.

**Files:**

- Modify: `src/screens/HomeScreen.tsx`
- Modify (verify): `src/components/home/HeroCard.tsx`
- Modify: `src/components/home/NextLectureSection.tsx`
- Modify: `src/components/home/QuickStatsCard.tsx`
- Modify: `src/components/home/AgendaItem.tsx`
- Tests: `src/components/home/HeroCard.unit.test.tsx`, `src/components/home/QuickStatsCard.unit.test.tsx`, `src/components/home/AgendaItem.unit.test.tsx`

### Step 1 — Write / extend characterization tests

- [ ] Add to `HeroCard.unit.test.tsx`:

```ts
it('renders hero content even when entryComplete is false', () => {
  const { getByText } = render(<HeroCard daysToInicet={90} daysToNeetPg={180} />);
  expect(getByText('EXAM COUNTDOWN')).toBeTruthy();
});

it('does not start pulse loop when entryComplete is false', () => {
  // Jest fake timers sanity: mount with entryComplete=false, advance past decorativeIdleDelayMs,
  // assert that no pulse timing interpolates past the static color.
  // Use the existing color assertion helper if present; otherwise assert the component tree
  // does not throw and no Animated.loop was registered via a spy on Animated.loop.
});
```

- [ ] Confirm `QuickStatsCard.unit.test.tsx` and `AgendaItem.unit.test.tsx` still render with press feedback. Add assertions that tap handlers fire.

### Step 2 — Run tests to verify baseline

Run: `npm run test:unit -- --runTestsByPath src/components/home/HeroCard.unit.test.tsx src/components/home/QuickStatsCard.unit.test.tsx src/components/home/AgendaItem.unit.test.tsx`
Expected: PASS (characterization baseline — the new assertions match current behavior).

### Step 3 — Screen shell wiring in `src/screens/HomeScreen.tsx`

- [ ] Import: `import ScreenMotion from '../motion/ScreenMotion';` and `import StaggeredEntrance from '../motion/StaggeredEntrance';`.
- [ ] Add state: `const [entryComplete, setEntryComplete] = useState(false);`.
- [ ] Wrap the outermost returned content (inside `SafeAreaView`) with:

```tsx
<ScreenMotion
  trigger="first-mount"
  isEntryComplete={() => setEntryComplete(true)}
  style={{ flex: 1 }}
>
  {/* existing content */}
</ScreenMotion>
```

- [ ] If the screen currently uses `PageTransition`, leave it — it now delegates to `ScreenMotion`. Do not double-wrap.
- [ ] Wrap only these first-visible elements with `StaggeredEntrance`, each with a monotonically-increasing `index`:
  - `0` — header / greeting row.
  - `1` — `HeroCard` (pass `entryComplete={entryComplete}`).
  - `2` — `CompactQuickStatsBar` **or** `QuickStatsCard` (whichever is the first-visible stats row).
  - `3` — first rendered `AgendaItem` / `TodayPlanCard` group **or** `NextLectureSection` if that is the first card group on first visible viewport.
- [ ] Do **not** wrap the full scrollable body. Anything below the fold scrolls in on normal mount.
- [ ] If there is an existing streak flame / success pulse loop elsewhere in `HomeScreen`, gate its `useEffect` on `entryComplete` (mirror the HeroCard pattern).

### Step 4 — `HeroCard` verify + tighten

- [ ] Confirm `entryComplete` prop flows from `HomeScreen`.
- [ ] No other change expected; pulse already gated. If `pulseAnim.stopAnimation()` triggers a warning under reduced motion, wrap that branch to avoid double-stop.

### Step 5 — `NextLectureSection`, `QuickStatsCard`, `AgendaItem`

- [ ] `NextLectureSection.tsx`: only wrap the outer section `View` with `StaggeredEntrance` **if** HomeScreen placed it in the first-visible bucket. Inside the section, keep the list of lectures un-staggered.
- [ ] `QuickStatsCard.tsx`: if it renders a `Pressable`, replace any bespoke `Animated.timing` press feedback with the same Reanimated `useSharedValue` + `withTiming(cardPressTiming.in / out)` pattern used in `SubjectCard.tsx`. If it is non-pressable, leave it.
- [ ] `AgendaItem.tsx`: same pattern — swap any `onPressIn/Out` bespoke timings for `cardPressTiming`. Keep haptics intact.
- [ ] Do not add any new decorative loops.

### Step 6 — Run tests

Run: `npm run test:unit -- --runTestsByPath src/components/home/HeroCard.unit.test.tsx src/components/home/QuickStatsCard.unit.test.tsx src/components/home/AgendaItem.unit.test.tsx src/components/home/DailyAgendaSection.unit.test.tsx`
Expected: PASS.

### Step 7 — Commit

```bash
git add src/screens/HomeScreen.tsx \
        src/components/home/HeroCard.tsx \
        src/components/home/NextLectureSection.tsx \
        src/components/home/QuickStatsCard.tsx \
        src/components/home/AgendaItem.tsx \
        src/components/home/HeroCard.unit.test.tsx \
        src/components/home/QuickStatsCard.unit.test.tsx \
        src/components/home/AgendaItem.unit.test.tsx
git commit -m "feat: wire hybrid motion into home screen"
```

---

## Task 4 — Integrate Hybrid Motion into Syllabus

**Why:** Syllabus is the heaviest list screen. The risk here is staggering inside the FlatList — which must NOT happen. Only the chrome above the list gets motion; the list renders normally.

**Files:**

- Modify: `src/screens/SyllabusScreen.tsx`
- Modify (verify): `src/components/SubjectCard.tsx`
- Tests: `src/navigation/tabNavigatorOptions.unit.test.ts`

### Step 1 — Pin tab config characterization test

- [ ] Ensure `src/navigation/tabNavigatorOptions.unit.test.ts` contains (add if missing):

```ts
import { TAB_NAVIGATOR_SCREEN_OPTIONS, TAB_NAVIGATOR_PERFORMANCE_PROPS } from './tabNavigatorOptions';

it('keeps tab animation disabled', () => {
  expect(TAB_NAVIGATOR_SCREEN_OPTIONS.animation).toBe('none');
});

it('keeps tab performance config stable', () => {
  expect(TAB_NAVIGATOR_PERFORMANCE_PROPS.detachInactiveScreens).toBe(true);
  expect(TAB_NAVIGATOR_PERFORMANCE_PROPS.lazy).toBe(true);
  expect(TAB_NAVIGATOR_PERFORMANCE_PROPS.freezeOnBlur).toBe(true);
});
```

- [ ] If these constants do not exist as named exports yet, extract them from `TabNavigator.tsx` into a sibling `tabNavigatorOptions.ts` and re-import there. Otherwise leave alone.

Run: `npm run test:unit -- --runTestsByPath src/navigation/tabNavigatorOptions.unit.test.ts`
Expected: PASS.

### Step 2 — Screen shell wiring in `src/screens/SyllabusScreen.tsx`

- [ ] Import `ScreenMotion` and `StaggeredEntrance`.
- [ ] Wrap the main content tree (inside `SafeAreaView`, outside `FlatList`) in `ScreenMotion` with:

```tsx
<ScreenMotion trigger="first-mount" style={{ flex: 1 }}>
  {/* header + hero + sort controls + FlatList */}
</ScreenMotion>
```

- [ ] Apply `StaggeredEntrance` individually to:
  - `0` — header / search bar row.
  - `1` — hero progress block (overall progress bar — keep the existing `useSharedValue` progress animation; stagger wraps only the visual container).
  - `2` — sort/filter control row.
- [ ] **Do not** set `StaggeredEntrance` on `FlatList` or on each `renderItem`. The list renders normally. If a first-N-cards reveal is desired, use `renderItem` index `< 2` + a local `FadeIn.delay(index * sectionStaggerMs)` on the item root — but only if product confirms; default is no per-item animation.
- [ ] Keep `onRefresh`, the throttled focus-reload `useFocusEffect`, and any existing data behavior untouched.

### Step 3 — Focus-settle on tab revisit

- [ ] The default `trigger="first-mount"` is correct for the first mount. `ScreenMotion` internally switches subsequent focuses to the `focus-settle` timing via `playedInitialMountRef`. Nothing extra to pass.

### Step 4 — `SubjectCard` verify

- [ ] Confirm `SubjectCard.tsx` still uses `cardPressTiming.in / out` (already true). No edit needed.

### Step 5 — Run tests

Run: `npm run test:unit -- --runTestsByPath src/navigation/tabNavigatorOptions.unit.test.ts`
Expected: PASS.

### Step 6 — Commit

```bash
git add src/screens/SyllabusScreen.tsx \
        src/navigation/tabNavigatorOptions.unit.test.ts
git commit -m "feat: wire hybrid motion into syllabus"
```

---

## Task 5 — Integrate Hybrid Motion into Guru Chat

**Why:** Chat is delicate — streaming messages, typing dots, composer focus states. The rule: the entrance plays once per mount; all live motion (typing dots, streaming text) starts/continues unaffected. The FlatList of messages never gets item-level stagger.

**Files:**

- Modify: `src/screens/GuruChatScreen.tsx`
- Tests: `src/navigation/RootNavigator.unit.test.tsx`

### Step 1 — Keep smoke test

- [ ] Ensure `RootNavigator.unit.test.tsx` still contains a mount-smoke for the route that reaches Chat. Do not add animation-behavior assertions — that is not this suite's job.

Run: `npm run test:unit -- --runTestsByPath src/navigation/RootNavigator.unit.test.tsx`
Expected: PASS (baseline).

### Step 2 — Screen shell wiring in `src/screens/GuruChatScreen.tsx`

- [ ] Import `ScreenMotion` and `StaggeredEntrance`.
- [ ] Add local state: `const [entryComplete, setEntryComplete] = useState(false);`.
- [ ] Wrap the returned screen tree (inside `SafeAreaView`, above the `KeyboardAvoidingView` if that is the current outer) in:

```tsx
<ScreenMotion
  trigger="first-mount"
  isEntryComplete={() => setEntryComplete(true)}
  style={{ flex: 1 }}
>
  {/* existing content */}
</ScreenMotion>
```

- [ ] Apply `StaggeredEntrance` to:
  - `0` — header / thread title row.
  - `1` — chat body container (the `View` that wraps the `FlatList`, **not** the `FlatList` itself).
  - `2` — composer + tool row (input + send + attachments).
- [ ] The existing typing-dots animation (`animateDots`) is live motion tied to AI state, not entrance motion. Leave it. Optionally gate its first start on `entryComplete` if product reports it competes with entry choreography — otherwise leave.
- [ ] Do not animate history items. Existing `FlatList` semantics stay.

### Step 3 — Preserve existing behavior

- [ ] Verify thread hydration (`useGuruChatThread` or equivalent) fires at the same lifecycle — `ScreenMotion` only controls the outer `opacity/transform`, not mount order.
- [ ] Verify keyboard avoidance works: `ScreenMotion` wraps `KeyboardAvoidingView` (if present) or sits above `SafeAreaView` — whichever keeps measurement stable. Prefer: `SafeAreaView > ScreenMotion > KeyboardAvoidingView > content`.
- [ ] Verify the smoke test after wiring.

### Step 4 — Run tests

Run: `npm run test:unit -- --runTestsByPath src/navigation/RootNavigator.unit.test.tsx`
Expected: PASS.

### Step 5 — Commit

```bash
git add src/screens/GuruChatScreen.tsx \
        src/navigation/RootNavigator.unit.test.tsx
git commit -m "feat: wire hybrid motion into guru chat"
```

---

## Task 6 — Final Verification and Cleanup

**Why:** Catch type regressions, run the focused suite, walk the manual device checklist, and confirm nothing else regressed.

### Step 1 — Typecheck

- [ ] Run: `./node_modules/.bin/tsc --noEmit`
- [ ] Expected: PASS. Fix any `ScreenMotionProps` / default-export mismatches before moving on.

### Step 2 — Focused Jest

- [ ] Run:

```bash
npm run test:unit -- --runTestsByPath \
  src/motion/presets.unit.test.ts \
  src/hooks/useHomeDashboardData.unit.test.ts \
  src/navigation/tabNavigatorOptions.unit.test.ts \
  src/navigation/RootNavigator.unit.test.tsx \
  src/components/home/HeroCard.unit.test.tsx \
  src/components/home/QuickStatsCard.unit.test.tsx \
  src/components/home/AgendaItem.unit.test.tsx \
  src/components/home/DailyAgendaSection.unit.test.tsx
```

- [ ] Expected: PASS.

### Step 3 — Full CI check

- [ ] Run: `npm run verify:ci`
- [ ] Expected: PASS (lint + unit + logic coverage gate).

### Step 4 — Manual device / Metro verification

Start Metro + install dev APK on the Genymotion device or a physical Android device:

```bash
npm start
npm run detox:build:android:genymotion:dev
# or: install dev APK manually via scripts/adb-install-dev-apk.js
```

Walk and confirm:

- [ ] Cold start → Home plays full first-mount entrance once.
- [ ] `Home → Syllabus → Home` → second Home visit plays focus-settle, not full entrance.
- [ ] `Home → Guru Chat → Home` → same.
- [ ] `Syllabus → Guru Chat → Syllabus` → Syllabus FlatList scrolls at full speed; no per-item entrance replays.
- [ ] HeroCard pulse only starts *after* entry completes (use a 60 or 90 day exam date to trigger `isAnyUrgent`).
- [ ] Chat: typing dots run while AI responds; entrance does not block send.
- [ ] Turn on "Reduce Motion" in Android developer / accessibility settings — confirm:
  - first-mount is a short opacity/translate only; no scale.
  - pulse loop never starts.
  - stagger reduces to plain render (no entering animation).
- [ ] Tab-bar swaps remain `animation: 'none'`.

### Step 5 — Cleanup sweep

- [ ] Grep for any leftover direct `Animated.timing` press feedback in `src/components/home/*.tsx` that should now use `cardPressTiming`. Convert or leave a TODO referencing this plan.
- [ ] Grep for `PageTransition` usages. They should all still work; any that passed props not on `ScreenMotionProps` (e.g. custom trigger strings) should be tightened.
- [ ] If no second consumer of a shared press helper has emerged, leave `src/motion/pressMotion.ts` **unbuilt** — do not add an unused module. Re-evaluate only when a third card type needs it.

### Step 6 — Final commit

```bash
git add src/motion src/screens/HomeScreen.tsx src/screens/SyllabusScreen.tsx src/screens/GuruChatScreen.tsx \
        src/components/PageTransition.tsx src/components/SubjectCard.tsx \
        src/components/home/HeroCard.tsx src/components/home/NextLectureSection.tsx \
        src/components/home/QuickStatsCard.tsx src/components/home/AgendaItem.tsx
git commit -m "feat: complete hybrid motion system"
```

---

## Risk Notes / Gotchas

- **Do not wrap `FlatList` / long `ScrollView` children** in `StaggeredEntrance`. Reanimated `FadeIn` on 100+ items kills TTI.
- **Do not increase `sectionStaggerMs`** beyond 60 — the preset test enforces ≤ 60 and humans perceive anything longer as sluggish on first paint.
- **`isEntryComplete` fires via `setTimeout`**, not on the UI thread. If a decorative loop depends on it and must start right when visuals land, add a small (+40 ms) grace inside the consumer — do not shorten `screenEnterTiming`.
- **Double-animation trap:** if a screen is already wrapped in `PageTransition`, do NOT also wrap in `ScreenMotion` — `PageTransition` now delegates. Replace `PageTransition` with `ScreenMotion` only if you need `trigger`, `isEntryComplete`, or `isFocused` controls.
- **Focus-settle only works when React Navigation is the source of focus.** If a screen is rendered outside a navigator (e.g. a modal mounted imperatively), pass `isFocused` explicitly.
- **Reduced motion is a runtime signal.** Do not cache the value across mounts; the hook already subscribes to `reduceMotionChanged`.
- **Tab navigator config must remain `animation: 'none'`.** Any visual "tab slide" would fight the screen-shell entrance and feel janky on Android.

---

## Rollback Plan

Each task is a single commit. To back out a problematic screen:

```bash
git revert <commit-hash-for-that-task>
```

Primitives (Tasks 1 & 2) stay committed — reverting a screen integration only removes the `ScreenMotion` wrap, not the library.
