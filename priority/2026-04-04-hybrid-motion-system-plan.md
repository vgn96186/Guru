# Hybrid Motion System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a shared hybrid motion system that gives Home, Syllabus, and Guru Chat expressive but performant navigation and in-screen animations.

**Architecture:** Introduce a shared Reanimated motion layer for screen-shell entry, section reveal, and standardized interaction feedback while keeping tab transitions lightweight. Major screens will use a consistent first-mount entrance, a softer focus-settle on tab re-entry, and delayed decorative motion so navigation stays smooth under Android load.

**Tech Stack:** React Native, Expo, TypeScript, React Navigation 7, react-native-reanimated 4, Zustand, Jest

---

## File Map

### New files

- `src/motion/presets.ts`
  Shared timing, spring, and delay tokens plus reduced-motion helpers.
- `src/motion/useReducedMotion.ts`
  Reads OS/app reduced-motion preference and exposes a stable hook for motion components.
- `src/motion/ScreenMotion.tsx`
  Root screen-shell wrapper with trigger modes (`first-mount`, `focus-settle`, `manual`).
- `src/motion/StaggeredEntrance.tsx`
  Reusable section wrapper for above-the-fold staged reveals only.
- `src/motion/pressMotion.ts`
  Shared interaction-motion helpers for cards/buttons that currently implement one-off press effects.
- `src/motion/index.ts`
  Barrel export for the motion system.
- `src/motion/presets.unit.test.ts`
  Logic/config tests for canonical motion presets and reduced-motion fallbacks.

### Modified files

- `src/screens/HomeScreen.tsx`
  Wrap screen shell, stage major sections, and delay decorative loops until entry completes.
- `src/screens/SyllabusScreen.tsx`
  Wrap shell, stage header/hero/first visible subject cards, and keep long lists outside full stagger chains.
- `src/screens/GuruChatScreen.tsx`
  Wrap shell, stage header/body/composer, and delay ambient motion until entry completes.
- `src/components/PageTransition.tsx`
  Convert or retire in favor of the new shared screen motion wrapper.
- `src/components/SubjectCard.tsx`
  Switch to shared press-motion tokens/helper rather than bespoke timing.
- `src/components/home/NextLectureSection.tsx`
  Optionally use shared section entrance for the Home above-the-fold area only.
- `src/components/home/HeroCard.tsx`
  Delay ambient pulse until screen entry completes or soften it through shared presets.
- `src/components/home/QuickStatsCard.tsx`
  Align any visible above-the-fold stat motion with the shared system if used in the Home first view.
- `src/components/home/AgendaItem.tsx`
  Standardize tap feedback and avoid bespoke interaction timing in the first visible card path.
- `src/navigation/TabNavigator.tsx`
  Ensure tab performance settings remain aligned with the motion system and do not double-animate.

### Test files to run

- `src/motion/presets.unit.test.ts`
- `src/hooks/useHomeDashboardData.unit.test.ts`
- `src/navigation/tabNavigatorOptions.unit.test.ts`
- `src/navigation/RootNavigator.unit.test.tsx`
- `src/components/home/HeroCard.unit.test.tsx`

---

### Task 1: Create Shared Motion Presets

**Files:**

- Create: `src/motion/presets.ts`
- Create: `src/motion/useReducedMotion.ts`
- Create: `src/motion/index.ts`
- Test: `src/motion/presets.unit.test.ts`

- [ ] **Step 1: Write the failing preset test**

```ts
import { cardPressTiming, screenEnterTiming, sectionStaggerMs } from './presets';

describe('motion presets', () => {
  it('exports expressive-but-short screen timing', () => {
    expect(screenEnterTiming.duration).toBeGreaterThanOrEqual(220);
    expect(screenEnterTiming.duration).toBeLessThanOrEqual(280);
  });

  it('exports tight stagger intervals', () => {
    expect(sectionStaggerMs).toBeGreaterThanOrEqual(45);
    expect(sectionStaggerMs).toBeLessThanOrEqual(60);
  });

  it('keeps press-in faster than press-out', () => {
    expect(cardPressTiming.in).toBeLessThan(cardPressTiming.out);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- --runTestsByPath src/motion/presets.unit.test.ts`
Expected: FAIL because the preset module does not exist yet.

- [ ] **Step 3: Write minimal implementation**

Create `src/motion/presets.ts` with:

```ts
export const screenEnterTiming = { duration: 240 } as const;
export const screenSettleTiming = { duration: 160 } as const;
export const sectionEnterTiming = { duration: 180 } as const;
export const sectionStaggerMs = 50;
export const cardPressTiming = { in: 80, out: 150 } as const;
export const decorativeIdleDelayMs = 320;
```

Create `src/motion/useReducedMotion.ts` as a small hook that returns a boolean and defaults safely to `false` until the OS/app signal is wired in. Create `src/motion/index.ts` barrel exports.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:unit -- --runTestsByPath src/motion/presets.unit.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/motion/presets.ts src/motion/useReducedMotion.ts src/motion/index.ts src/motion/presets.unit.test.ts
git commit -m "feat: add shared motion presets"
```

### Task 2: Build Screen-Shell and Section-Reveal Motion Primitives

**Files:**

- Create: `src/motion/ScreenMotion.tsx`
- Create: `src/motion/StaggeredEntrance.tsx`
- Modify: `src/components/PageTransition.tsx`
- Test: `src/motion/presets.unit.test.ts`

- [ ] **Step 1: Write the failing test for trigger policy**

Add tests asserting that the screen-motion module exports trigger modes and reduced-motion-safe defaults:

```ts
import { SCREEN_MOTION_TRIGGERS } from './presets';

it('supports first-mount and focus-settle triggers', () => {
  expect(SCREEN_MOTION_TRIGGERS).toContain('first-mount');
  expect(SCREEN_MOTION_TRIGGERS).toContain('focus-settle');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- --runTestsByPath src/motion/presets.unit.test.ts`
Expected: FAIL because trigger constants are not exported yet.

- [ ] **Step 3: Write minimal implementation**

Add to `src/motion/presets.ts`:

```ts
export const SCREEN_MOTION_TRIGGERS = ['first-mount', 'focus-settle', 'manual'] as const;
export type ScreenMotionTrigger = (typeof SCREEN_MOTION_TRIGGERS)[number];
```

Create `src/motion/ScreenMotion.tsx` with:

- root `Animated.View`
- `trigger` prop
- `isFocused` signal sourced via `useIsFocused` internally or passed explicitly from the screen shell
- `isEntryComplete` callback
- logic to run full entrance once on first mount, then only a smaller settle on later focus
- reduced-motion branch with shorter opacity/translate only

Create `src/motion/StaggeredEntrance.tsx` with:

- `index` prop
- `disabled` prop
- above-the-fold-only usage expectation in comments

Update `src/components/PageTransition.tsx` to re-export or delegate to `ScreenMotion` so old imports do not drift.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:unit -- --runTestsByPath src/motion/presets.unit.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/motion/ScreenMotion.tsx src/motion/StaggeredEntrance.tsx src/components/PageTransition.tsx src/motion/presets.ts src/motion/presets.unit.test.ts
git commit -m "feat: add reusable screen motion primitives"
```

### Task 3: Integrate Hybrid Motion into Home

**Files:**

- Modify: `src/screens/HomeScreen.tsx`
- Modify: `src/components/home/HeroCard.tsx`
- Modify: `src/components/home/NextLectureSection.tsx`
- Modify: `src/components/home/QuickStatsCard.tsx`
- Modify: `src/components/home/AgendaItem.tsx`
- Test: `src/components/home/HeroCard.unit.test.tsx`

- [ ] **Step 1: Write the failing or characterization test**

Extend `src/components/home/HeroCard.unit.test.tsx` with a test that ensures the core countdown still renders while motion props are present, not hidden behind delayed mounting.

```ts
it('renders hero content even when motion wrappers are applied', () => {
  const { getByText } = render(<HeroCard {...defaultProps} />);
  expect(getByText('EXAM COUNTDOWN')).toBeTruthy();
});
```

- [ ] **Step 2: Run test to verify current behavior**

Run: `npm run test:unit -- --runTestsByPath src/components/home/HeroCard.unit.test.tsx`
Expected: PASS (characterization baseline)

- [ ] **Step 3: Write minimal implementation**

In `src/screens/HomeScreen.tsx`:

- wrap the screen body in `ScreenMotion`
- create an `entryComplete` state
- apply `StaggeredEntrance` to header, hero CTA, stats, and first card group only
- delay the countdown pulse and streak flame loop until `entryComplete` is true
- do not animate the entire scroll body item-by-item

In `src/components/home/HeroCard.tsx`:

- soften or delay the pulse using shared presets
- keep motion optional and reduced-motion aware

In `src/components/home/NextLectureSection.tsx`:

- only wrap the section container if it is above the fold on Home
- do not animate every lecture row independently

In `src/components/home/QuickStatsCard.tsx` and `src/components/home/AgendaItem.tsx`:

- standardize press feedback through shared motion timing/helper if these components are part of the first visible Home path
- do not introduce new decorative loops

- [ ] **Step 4: Run tests to verify it passes**

Run: `npm run test:unit -- --runTestsByPath src/components/home/HeroCard.unit.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/screens/HomeScreen.tsx src/components/home/HeroCard.tsx src/components/home/NextLectureSection.tsx src/components/home/QuickStatsCard.tsx src/components/home/AgendaItem.tsx src/components/home/HeroCard.unit.test.tsx
git commit -m "feat: add hybrid motion to home screen"
```

### Task 4: Integrate Hybrid Motion into Syllabus

**Files:**

- Modify: `src/screens/SyllabusScreen.tsx`
- Modify: `src/components/SubjectCard.tsx`
- Test: `src/navigation/tabNavigatorOptions.unit.test.ts`

- [ ] **Step 1: Write a characterization safety test or config assertion**

Add/keep a test ensuring tab performance config stays `animation: 'none'` and detached/lazy/frozen:

```ts
expect(TAB_NAVIGATOR_SCREEN_OPTIONS.animation).toBe('none');
expect(TAB_NAVIGATOR_PERFORMANCE_PROPS.detachInactiveScreens).toBe(true);
```

- [ ] **Step 2: Run test to verify baseline**

Run: `npm run test:unit -- --runTestsByPath src/navigation/tabNavigatorOptions.unit.test.ts`
Expected: PASS

- [ ] **Step 3: Write minimal implementation**

In `src/screens/SyllabusScreen.tsx`:

- wrap the content in `ScreenMotion`
- stagger only the header/search, hero progress block, sort controls, and the first visible subject cards
- avoid animating the entire FlatList dataset
- keep throttled focus reload behavior intact

In `src/components/SubjectCard.tsx`:

- replace bespoke press timing with shared press-motion timing/helper
- keep haptic behavior intact

- [ ] **Step 4: Run characterization safety test again**

Run: `npm run test:unit -- --runTestsByPath src/navigation/tabNavigatorOptions.unit.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/screens/SyllabusScreen.tsx src/components/SubjectCard.tsx src/navigation/tabNavigatorOptions.unit.test.ts
git commit -m "feat: add hybrid motion to syllabus"
```

### Task 5: Integrate Hybrid Motion into Guru Chat

**Files:**

- Modify: `src/screens/GuruChatScreen.tsx`
- Test: `src/navigation/RootNavigator.unit.test.tsx`

- [ ] **Step 1: Write or keep a navigation smoke safety test**

Use the existing RootNavigator render test as a smoke check for navigation-level compatibility.

```ts
it('renders without crashing', () => {
  const { toJSON } = render(<RootNavigator initialRoute="CheckIn" />);
  expect(toJSON()).toBeDefined();
});
```

- [ ] **Step 2: Run the smoke test**

Run: `npm run test:unit -- --runTestsByPath src/navigation/RootNavigator.unit.test.tsx`
Expected: PASS

- [ ] **Step 3: Write minimal implementation**

In `src/screens/GuruChatScreen.tsx`:

- wrap the screen shell in `ScreenMotion`
- stagger header, visible chat body container, and composer/tool row
- do not animate full history item-by-item
- delay ambient or typing-adjacent decorative motion until entry completes
- preserve existing thread hydration and data-loading behavior
- treat the smoke test as compatibility coverage only, not proof of animation quality

- [ ] **Step 4: Run smoke test again**

Run: `npm run test:unit -- --runTestsByPath src/navigation/RootNavigator.unit.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/screens/GuruChatScreen.tsx src/navigation/RootNavigator.unit.test.tsx
git commit -m "feat: add hybrid motion to guru chat"
```

### Task 6: Final Verification and Cleanup

**Files:**

- Modify: any touched files from previous tasks
- Test: `src/hooks/useHomeDashboardData.unit.test.ts`
- Test: `src/navigation/tabNavigatorOptions.unit.test.ts`
- Test: `src/navigation/RootNavigator.unit.test.tsx`
- Test: `src/components/home/HeroCard.unit.test.tsx`
- Test: `src/motion/presets.unit.test.ts`

- [ ] **Step 1: Run typecheck**

Run: `./node_modules/.bin/tsc --noEmit`
Expected: PASS

- [ ] **Step 2: Run focused Jest checks**

Run: `npm run test:unit -- --runTestsByPath src/motion/presets.unit.test.ts src/hooks/useHomeDashboardData.unit.test.ts src/navigation/tabNavigatorOptions.unit.test.ts src/navigation/RootNavigator.unit.test.tsx src/components/home/HeroCard.unit.test.tsx`
Expected: PASS

- [ ] **Step 3: Manual verification checklist**

Verify on device or dev client:

- `Home -> Syllabus -> Home`
- `Home -> Guru Chat -> Home`
- `Syllabus -> Guru Chat -> Home`
- first mount shows full entrance
- quick tab revisit does not replay full choreography
- decorative pulses start after entry rather than during the first beat
- reduced-motion fallback still leaves the UI legible
- reduced-motion hook is connected to a real OS/app preference signal before the feature is considered complete

- [ ] **Step 4: Commit final polish**

```bash
git add src/motion src/screens/HomeScreen.tsx src/screens/SyllabusScreen.tsx src/screens/GuruChatScreen.tsx src/components/PageTransition.tsx src/components/SubjectCard.tsx src/components/home/HeroCard.tsx src/components/home/NextLectureSection.tsx
git commit -m "feat: implement hybrid motion system"
```
