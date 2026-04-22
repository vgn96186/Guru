# NativeWind UI Migration — Design Spec

**Date:** 2026-04-16
**Status:** Draft — pending user review
**Author:** Claude (opus-4-6), brainstormed with Vishnu
**Scope:** Migrate entire UI layer from `StyleSheet.create` to NativeWind (Tailwind utility classes for React Native), redesign visual system toward B&W hi-contrast + glassmorphism while preserving Linear-purple brand identity.

---

## 1. Goal

Cut UI boilerplate across 124 files (142 `StyleSheet.create` call sites), adopt NativeWind as the styling system, and fix visible problems in the current look (murky pure-black base, invisible borders, washed-out text, flat gradients) while keeping Inter typography, the purple `#5E6AD2` identity, and real glass surfaces.

Android-only, dark-mode-only, Expo SDK 54.

## 2. Non-Goals

- Not switching to Tamagui, Restyle, Unistyles, or styled-components.
- Not adopting NativeWind UI (the paid component kit on nativewindui.com). Core NativeWind only.
- Not supporting a light theme.
- Not touching business logic, DB layer, AI service, navigation structure.
- Not rewriting animations. Reanimated stays. `Animated.Value`-driven styles remain in `StyleSheet` form where className can't express runtime-interpolated values (documented exceptions).
- Not changing typography (Inter 400..900 stack unchanged).

## 3. Current State

- Pure React Native `StyleSheet.create` — 142 call sites, 124 files.
- Custom `Linear*` primitives under `src/components/primitives/`: `LinearText`, `LinearSurface`, `LinearButton`, `LinearChipButton`, `LinearBadge`, `LinearDivider`, `LinearIconButton`, `LinearTextInput`, `EmptyState`, `AppBottomSheet`, `AppFlashList`, `BackIconButton`, `SettingsIconButton`.
- Central theme: `src/theme/linearTheme.ts` — colors (rgba glass tints), spacing, radius, typography.
- 50+ screens across HomeStack, SyllabusStack, MenuStack, Root modals.
- 184 `.tsx` files, 361 `.ts` files.
- No NativeWind, Tailwind, Restyle, styled-components, Emotion, or Unistyles currently installed.

**Visual pain points:**

- Base `#000` on OLED produces smear / depth-loss.
- Borders at `rgba(255,255,255,0.08)` disappear on dark surfaces.
- Secondary text `#A0A0A5` is low-contrast on near-black.
- Gradients used as a substitute for real glass — flat, washed.
- Thin touch targets in some screens.

## 4. Target State

### 4.1 Tech Stack

- `nativewind@^4` — Tailwind utility classes for RN via Metro transform.
- `tailwindcss@^3.4` — peer.
- `tailwind-variants` — variant-to-className mapper for primitives with `variant`/`tone` props.
- `expo-blur` (already installed) — real `BlurView` for glass surfaces.
- `expo-linear-gradient` (already installed) — kept for tinted overlays on top of blur.

### 4.2 Architecture — Hybrid Primitives Strategy (C)

Semantic primitives retained, internals rewritten:

- `LinearText` — keeps `variant` × `tone` prop API, internals use `tailwind-variants`.
- `LinearButton`, `LinearChipButton`, `LinearBadge`, `LinearIconButton`, `LinearTextInput`, `EmptyState` — same.
- `BackIconButton`, `SettingsIconButton` — same.
- `AppBottomSheet`, `AppFlashList` — same (light refactor to className).

Pure-style primitives deleted; call sites migrated to raw className:

- `LinearSurface` → `<View className="bg-surface rounded-lg border border-border">` at call sites.
- `LinearDivider` → `<View className="h-px bg-border" />`.

### 4.3 Theme — Single Source of Truth

`src/theme/linearTheme.ts` remains canonical. A new generator script (`scripts/buildTailwindConfig.ts`) reads `linearTheme.ts` and writes `tailwind.config.js`. Runs on `prebuild`, plus a `theme:sync` npm script.

**New token shape:**

```ts
export const linearTheme = {
  colors: {
    // Base — hi-contrast mono
    background: '#050506', // near-black, not pure (OLED-smear fix)
    surface: '#0B0B0E', // raised glass base (pre-blur)
    surfaceElevated: '#121217',
    border: 'rgba(255,255,255,0.14)', // thicker visible borders
    borderStrong: 'rgba(255,255,255,0.28)',
    textPrimary: '#FAFAFA', // near-white (was #F2F2F2)
    textSecondary: '#B8B8BD', // bumped from #A0A0A5 (WCAG AA on black)
    textMuted: '#7A7A80',
    textInverse: '#000000',

    // Purple accent — retained, gradient-ready
    accent: '#5E6AD2',
    accentGlow: 'rgba(94,106,210,0.35)',
    accentSurface: 'rgba(94,106,210,0.08)',
    accentBorder: 'rgba(94,106,210,0.45)',

    // States
    success: '#3FB950',
    warning: '#D97706',
    error: '#F14C4C',
    successSurface: 'rgba(63,185,80,0.1)',
    errorSurface: 'rgba(241,76,76,0.1)',

    // Glass overlays (LinearGradient on top of BlurView)
    glassTintStart: 'rgba(255,255,255,0.06)',
    glassTintEnd: 'rgba(255,255,255,0.00)',
    glassPurpleStart: 'rgba(94,106,210,0.18)',
    glassPurpleEnd: 'rgba(94,106,210,0.00)',
  },
  spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, '2xl': 48 },
  radius: { sm: 8, md: 12, lg: 16, xl: 20, full: 9999 },
  blur: { subtle: 20, standard: 40, heavy: 80 },
  typography: {
    /* unchanged — Inter 400..900 */
  },
} as const;
```

### 4.4 Visual System Changes

**Kept:** Inter font, purple `#5E6AD2` identity, gradient accents on CTAs/highlights, glass surfaces.

**Changed:**

- Pure `#000` background → `#050506`.
- Borders `0.08` → `0.14` default, `0.28` for focused/pressed/highlighted.
- Secondary text contrast bumped (`#A0A0A5` → `#B8B8BD`; `#F2F2F2` → `#FAFAFA`).
- Flat gradient "glass" → real `BlurView` + LinearGradient tint overlay on: primary surfaces, bottom sheets, Home hero, Session menu, modals.
- Minimum 44pt hit-slop enforced across interactive primitives.

**Disciplinary screens** (Punishment, BedLock, Lockdown, Doomscroll Interceptor, BreakEnforcer): pure mono treatment, zero purple accent. Visual hierarchy = `purple = productive`, `mono = enforcement`. Harsher contrast, sharper edges, no blur on these screens.

### 4.5 Build/Tool Configuration

- `babel.config.js` — add `nativewind/babel` preset.
- `metro.config.js` — wrap `getDefaultConfig(__dirname)` with `withNativeWind({ input: './global.css' })`.
- `global.css` — `@tailwind base; @tailwind components; @tailwind utilities;`.
- `tailwind.config.js` — auto-generated; content paths: `./src/**/*.{ts,tsx}`, `./App.tsx`, `./modules/**/*.{ts,tsx}`. Theme.extend populated from `linearTheme.ts`. Dark mode `class` with always-on dark root wrapper.
- `tsconfig.json` — include `nativewind-env.d.ts` for `className` prop typing on `View`, `Text`, `Pressable`, etc.
- `jest.config.js` / `jest.unit.logic.config.js` — uses `jest-expo` preset, which handles NativeWind already. Audit for any `StyleSheet` mocks.
- Detox — no change. Renders real RN. Critical suite uses `testID`, not style assertions.
- New script: `scripts/buildTailwindConfig.ts` — runs before Metro start. Invoked by `npm run theme:sync` and `prebuild`.
- New npm scripts:
  - `theme:sync` — regenerate tailwind config from linearTheme.ts.
  - `verify:ci` — unchanged, picks up new tests.

### 4.6 Primitives — Internal Shape (tailwind-variants)

Example `LinearButton`:

```ts
import { Pressable, View } from 'react-native';
import { tv } from 'tailwind-variants';
import LinearText from './LinearText';

const button = tv({
  base: 'items-center justify-center rounded-md px-4 min-h-[44px]',
  variants: {
    variant: {
      primary: 'bg-accent',
      secondary: 'bg-surface border border-border',
      ghost: 'bg-transparent',
    },
    tone: {
      default: '',
      danger: 'bg-error',
    },
    pressed: { true: 'opacity-[0.88]' },
    disabled: { true: 'opacity-[0.55]' },
  },
  defaultVariants: { variant: 'primary', tone: 'default' },
});
```

Consumers unchanged:

```tsx
<LinearButton variant="primary" onPress={...}>Start</LinearButton>
```

## 5. Rollout — Six Phases

Bottom-up, atomic. Each phase = single PR, independently mergeable, `npm run verify:ci` passes at every commit. No long-lived branch.

**Phase 0 — Tooling (1–2 days)**
Install NativeWind, tailwind-variants, write `global.css`, `tailwind.config.js` generator, update babel/metro/jest/tsconfig. Smoke test: `<View className="bg-red-500" />` renders red on a Genymotion device. Zero visual change to existing app.

**Phase 1 — Theme rewrite (1 day)**
Rewrite `linearTheme.ts` with new tokens (Section 4.3). Run generator. Existing StyleSheet consumers that reference `textSecondary`/`textPrimary`/etc. pick up the minor contrast-bump automatically. Expected visual diff: secondary text slightly brighter, no layout change.

**Phase 2 — Primitive internals (3–5 days)**
Reimplement each surviving `Linear*` primitive with `tailwind-variants` + className. Public APIs unchanged. Existing unit tests (`LinearButton.unit.test.tsx`) still pass. Delete `LinearSurface` and `LinearDivider` — migrate their call sites to raw className in the same PR (`rg -l "LinearSurface|LinearDivider" src/` is the work list).

**Phase 3 — BlurView glass (2–3 days)**
Replace rgba "fake glass" in: `LinearSurface` consumers (post-Phase-2), `AppBottomSheet`, Home hero card, `SessionMenu`, modal backdrops, `DialogHost`. Use `expo-blur` `BlurView` with `intensity` from `linearTheme.blur` tokens, `LinearGradient` tint overlay where purple accent needed. Perf-test on mid-tier Android (target: no dropped frames scrolling HomeScreen).

**Phase 4 — Screen-by-screen className sweep (≈3 weeks)**
50 screens. Grouped per stack to keep PRs small:

- **HomeStack** (7 screens, 1 PR each for heavy ones): Home, Session, LectureMode, MockTest, Review, BossBattle, Inertia, ManualLog, DailyChallenge, FlaggedReview, GlobalTopicSearch.
- **SyllabusStack**: Syllabus, TopicDetail.
- **MenuStack**: StudyPlan, Stats, Flashcards, MindMap, Settings, DeviceLink, NotesHub, NotesSearch, ManualNoteCreation, TranscriptHistory, RecordingVault, ImageVault, NotesVault, TranscriptVault, QuestionBank, FlaggedContent.
- **Root modals** (Phase 4c, paired with Phase 6 disciplinary polish): Punishment, BedLock, Doomscroll, BreakEnforcer, Lockdown, CheckIn, BrainDumpReview, SleepMode, WakeUp, LocalModel, PomodoroQuiz.
- **Settings cluster** (`src/screens/settings/components/`, `src/components/settings/`).
- **Chat cluster** (`src/components/chat/`, GuruChatScreen).
- **Home cluster** (`src/components/home/`).
- **Shared components** (`src/components/*.tsx` outside primitives).

Each screen PR: delete `StyleSheet.create` block, replace `style={styles.foo}` with `className="..."`. Lint rule enforces no mixed usage on migrated files. Detox critical suite runs on every merge.

AI-heavy screens (`GuruChatScreen`, `SessionScreen`) scheduled last in Phase 4 to avoid churn on code that was just migrated to AI v2 (recent commits `1ad8c1e`, `4e49cf6`).

**Phase 5 — Dead code sweep (1 day)**
Remove unused style helpers, `colorUtils.ts` if redundant after generator handles conversions, unused `linearTheme` exports. Audit final bundle size (expect 2–4% reduction from deleted StyleSheet objects + NativeWind's treeshaking).

**Phase 6 — Disciplinary screens polish (2 days)**
Punishment / BedLock / Lockdown / Doomscroll Interceptor / BreakEnforcer re-skinned to pure mono, harsher contrast, no blur, no purple. Emphasizes "enforcement" tone distinct from productive surfaces.

**Total**: ~5–6 weeks serial. Each phase ships and can be paused after. No broken intermediate state.

## 6. Testing Strategy

- **Unit (`npm run test:unit:coverage:logic`)**: logic-allowlist tests don't touch UI — unaffected. UI component tests (`LinearButton.unit.test.tsx`, `GuruChatOverlay.unit.test.tsx`, etc.) re-run after each phase.
- **Detox critical (`npm run detox:test:critical:genymotion:dev`)**: runs after Phase 2 primitives land, and after each Phase 4 screen PR. Relies on `testID`, unaffected by className migration.
- **Visual smoke test per phase**: Metro + Genymotion, quick pass over each stack.
- **CI gate (`npm run verify:ci`)**: must pass on every PR. Lint rule added: forbid new `StyleSheet.create` in migrated files (allowlist shrinks per phase).
- **Performance probe (Phase 3)**: Genymotion mid-tier profile, scroll HomeScreen 30 seconds, inspect JS/UI frame drops via React DevTools profiler.

## 7. Risks & Mitigations

| Risk                                                    | Mitigation                                                                                                                                                            |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| NativeWind v4 Metro transform incompat with Expo SDK 54 | Verified compatible (SDK 54 uses Metro ≥0.80). Fallback: runtime `interop` mode (~5% slower, works).                                                                  |
| Jest tests fail on `className` prop                     | `jest-expo` preset supports it. Audit any `StyleSheet` mocks in Phase 0.                                                                                              |
| Detox references style objects                          | Audit confirms critical suite uses `testID` only. Safe.                                                                                                               |
| BlurView Android perf on mid-tier                       | Benchmark in Phase 3. Fall back to rgba overlay via `Platform.Version` check for low-end devices.                                                                     |
| Tailwind JIT purges used classes                        | Content globs cover all source roots. Lint rule: no dynamic className string concatenation (`className={\`bg-\${color}\`}`forbidden; use`tailwind-variants` instead). |
| Merge conflicts during 5-week window                    | Phase-gated small PRs. Each phase lands in 1–3 days max.                                                                                                              |
| AI v2 code churn overlap                                | Phase 4 order places `GuruChatScreen`/`SessionScreen` last.                                                                                                           |
| Theme generator drift                                   | `npm run theme:sync` in `prebuild`; CI check that generated config matches committed file.                                                                            |

## 8. Rollback

Each phase = one revertable PR. Phase 0 revert removes all tooling and reverts to `StyleSheet`-only. No lingering state. No migrations, no DB changes, no API changes.

## 9. Success Criteria

- Zero `StyleSheet.create` calls in `src/` after Phase 4 (with narrow documented exceptions for e.g. dynamic `Animated.Value`-driven styles where className can't express runtime-interpolated values).
- `npm run verify:ci` passes at every merge.
- Detox critical suite green.
- Visual QA checklist:
  - Home hero, cards, and bottom sheets use real BlurView.
  - Secondary text is readable on all screens (contrast ratio ≥ 4.5:1 on background).
  - Purple accent appears only on productive UI; disciplinary screens are mono.
  - No layout regressions on Genymotion Pixel 6 / Pixel 3a profiles.
- Bundle size reduced or flat.
- Dev experience: new screens can be styled without importing theme manually; `className` covers ~90% of needs.

## 10. Open Questions / Deferred

- **iOS support**: out of scope now, but `BlurView` + NativeWind both work on iOS with zero additional config if adopted later.
- **Per-device blur fallback threshold**: set after Phase 3 benchmark.
- **Design system documentation**: post-migration, a `docs/design-system.md` cataloguing tokens and primitive variants.
- **Storybook / visual regression tool**: not adopted now. Revisit after Phase 5.

---

**Next step after approval**: invoke `superpowers:writing-plans` to produce the executable implementation plan (phase-by-phase tasks, file lists, verification steps per PR).
