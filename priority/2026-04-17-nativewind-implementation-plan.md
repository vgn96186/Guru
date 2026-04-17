# NativeWind Migration — Implementation Plan

**Date:** 2026-04-17  
**Status:** Ready for execution  
**Author:** Orchestrator (based on design spec by Claude)  
**Scope:** Phase-by-phase implementation plan for migrating from StyleSheet.create to NativeWind

---

## Executive Summary

This plan outlines the 6-phase migration from StyleSheet.create to NativeWind for the Guru NEET-PG/INICET study app. The migration will:
1. Install NativeWind v4 and configure tooling
2. Update the theme to hi-contrast B&W + glassmorphism
3. Rewrite Linear* primitives with tailwind-variants
4. Implement real BlurView glass surfaces
5. Migrate 124 files (142 StyleSheet.create call sites) screen-by-screen
6. Polish disciplinary screens with pure mono treatment

**Total estimated timeline:** 5-6 weeks serial, each phase independently mergeable.

---

## Phase 0: Tooling Setup (1-2 days)

### Goals
- Install NativeWind dependencies
- Configure Metro, Babel, TypeScript
- Create theme generator script
- Smoke test with minimal visual change

### Tasks

#### 1. Install Dependencies
```bash
npm install nativewind@^4 tailwindcss@^3.4 tailwind-variants
```

#### 2. Configuration Files

**A. `tailwind.config.js` Generator**
Create `scripts/buildTailwindConfig.ts`:
- Reads `src/theme/linearTheme.ts`
- Generates `tailwind.config.js` with theme tokens
- Handles color, spacing, radius, typography mappings

**B. `global.css`**
Create `global.css` in project root:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

**C. `babel.config.js`**
Add NativeWind preset:
```javascript
module.exports = function(api) {
  api.cache(true);
  return {
    presets: [
      ['babel-preset-expo', { jsxRuntime: 'automatic' }],
      'nativewind/babel',
    ],
    // ... existing plugins
  };
};
```

**D. `metro.config.js`**
Wrap with `withNativeWind`:
```javascript
const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const config = getDefaultConfig(__dirname);

module.exports = withNativeWind(config, {
  input: './global.css',
  projectRoot: __dirname,
});
```

**E. TypeScript Support**
Create `nativewind-env.d.ts`:
```typescript
/// <reference types="nativewind/types" />
```

Update `tsconfig.json` to include this file.

#### 3. NPM Scripts
Add to `package.json`:
```json
{
  "scripts": {
    "theme:sync": "tsx scripts/buildTailwindConfig.ts",
    "prebuild": "npm run theme:sync"
  }
}
```

#### 4. Jest Configuration
Verify `jest-expo` preset handles NativeWind. Update `jest.unit.config.js` and `jest.unit.logic.config.js` if needed.

#### 5. Smoke Test
Create a test screen or modify existing component to verify NativeWind works:
```tsx
<View className="bg-red-500 p-4">
  <Text className="text-white">NativeWind test</Text>
</View>
```

### Verification
- ✅ NativeWind compiles without errors
- ✅ `npm run theme:sync` generates config
- ✅ Metro starts with NativeWind transformer
- ✅ Jest tests pass
- ✅ Visual smoke test shows red box on device

### Files to Create/Modify
- `scripts/buildTailwindConfig.ts` (new)
- `global.css` (new)
- `nativewind-env.d.ts` (new)
- `babel.config.js` (modify)
- `metro.config.js` (modify)
- `tsconfig.json` (modify)
- `package.json` (modify)
- `jest.unit.config.js` (audit)

---

## Phase 1: Theme Rewrite (1 day)

### Goals
- Update `linearTheme.ts` with new hi-contrast tokens
- Run generator to update Tailwind config
- Verify color changes propagate

### Tasks

#### 1. Update `src/theme/linearTheme.ts`
Replace colors with new hi-contrast palette:
```typescript
export const linearTheme = {
  colors: {
    // Base — hi-contrast mono
    background: '#050506',        // near-black, not pure (OLED-smear fix)
    surface: '#0B0B0E',           // raised glass base (pre-blur)
    surfaceElevated: '#121217',
    border: 'rgba(255,255,255,0.14)',      // thicker visible borders
    borderStrong: 'rgba(255,255,255,0.28)',
    textPrimary: '#FAFAFA',       // near-white (was #F2F2F2)
    textSecondary: '#B8B8BD',     // bumped from #A0A0A5 (WCAG AA on black)
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
    glassTintEnd:   'rgba(255,255,255,0.00)',
    glassPurpleStart: 'rgba(94,106,210,0.18)',
    glassPurpleEnd:   'rgba(94,106,210,0.00)',
  },
  spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, '2xl': 48 },
  radius:  { sm: 8, md: 12, lg: 16, xl: 20, full: 9999 },
  blur:    { subtle: 20, standard: 40, heavy: 80 },
  typography: { /* unchanged — Inter 400..900 */ },
} as const;
```

#### 2. Update Generator Script
Ensure `scripts/buildTailwindConfig.ts` maps:
- Colors to Tailwind `colors` extend
- Spacing to `spacing`
- Radius to `borderRadius`
- Typography to `fontSize`, `lineHeight`, `fontFamily`

#### 3. Run Theme Sync
```bash
npm run theme:sync
```

#### 4. Visual Verification
Check secondary text contrast improvements on:
- HomeScreen
- SessionScreen
- SyllabusScreen
- SettingsScreen

### Verification
- ✅ `tailwind.config.js` regenerated with new colors
- ✅ Secondary text visibly brighter (WCAG AA compliant)
- ✅ No layout regressions
- ✅ All existing StyleSheet references to theme colors work

---

## Phase 2: Primitive Internals (3-5 days)

### Goals
- Rewrite Linear* primitives with tailwind-variants
- Delete LinearSurface and LinearDivider
- Migrate their call sites to raw className
- Maintain public API compatibility

### Tasks

#### 1. Primitives to Rewrite (keep API, change internals)
- `LinearText` (`src/components/primitives/LinearText.tsx`)
- `LinearButton` (`src/components/primitives/LinearButton.tsx`)
- `LinearChipButton` (`src/components/primitives/LinearChipButton.tsx`)
- `LinearBadge` (`src/components/primitives/LinearBadge.tsx`)
- `LinearIconButton` (`src/components/primitives/LinearIconButton.tsx`)
- `LinearTextInput` (`src/components/primitives/LinearTextInput.tsx`)
- `EmptyState` (`src/components/primitives/EmptyState.tsx`)
- `BackIconButton` (`src/components/primitives/BackIconButton.tsx`)
- `SettingsIconButton` (`src/components/primitives/SettingsIconButton.tsx`)
- `AppBottomSheet` (`src/components/primitives/AppBottomSheet.tsx`)
- `AppFlashList` (`src/components/primitives/AppFlashList.tsx`)

#### 2. Primitives to Delete (migrate call sites)
- `LinearSurface` (`src/components/primitives/LinearSurface.tsx`)
- `LinearDivider` (`src/components/primitives/LinearDivider.tsx`)

#### 3. Implementation Pattern for Each Primitive

**Example: LinearButton**
```typescript
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
      glass: 'bg-glass backdrop-blur-md',
      glassTinted: 'bg-glass-purple backdrop-blur-md',
      danger: 'bg-error',
    },
    size: {
      sm: 'h-8 px-3',
      md: 'h-12 px-4',
      lg: 'h-16 px-6',
    },
    pressed: { true: 'opacity-[0.88]' },
    disabled: { true: 'opacity-[0.55]' },
  },
  defaultVariants: { variant: 'primary', size: 'md' },
});

export default function LinearButton({ variant, size, pressed, disabled, ...props }) {
  const className = button({ variant, size, pressed, disabled });
  
  return (
    <Pressable className={className} {...props}>
      {/* ... children */}
    </Pressable>
  );
}
```

#### 4. Migration Script for Deleted Primitives
Find and replace all `LinearSurface` and `LinearDivider` usage:
```bash
# Find LinearSurface usage
rg -l "LinearSurface" src/

# Find LinearDivider usage  
rg -l "LinearDivider" src/

# Replacement patterns:
# <LinearSurface> → <View className="bg-surface rounded-lg border border-border">
# <LinearDivider /> → <View className="h-px bg-border" />
```

#### 5. Update Unit Tests
- Update `LinearButton.unit.test.tsx` and other component tests
- Ensure tests pass with new className-based implementation

### Verification
- ✅ All primitives render correctly with className
- ✅ Unit tests pass
- ✅ LinearSurface and LinearDivider removed from codebase
- ✅ No TypeScript errors
- ✅ Detox critical suite passes

---

## Phase 3: BlurView Glass (2-3 days)

### Goals
- Replace rgba "fake glass" with real BlurView
- Add LinearGradient tint overlays
- Performance test on mid-tier Android

### Tasks

#### 1. Identify Glass Surfaces
- Home hero card
- Session menu
- Modal backdrops
- DialogHost
- AppBottomSheet
- Anywhere using `surfaceGradientStart`/`surfaceGradientEnd`

#### 2. Create Glass Components
Create `src/components/primitives/GlassSurface.tsx`:
```typescript
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { View } from 'react-native';

export function GlassSurface({ 
  intensity = 40,
  tint = 'default', // 'default' | 'purple'
  children,
  className = '',
  ...props 
}) {
  const tintColors = tint === 'purple' 
    ? ['rgba(94,106,210,0.18)', 'rgba(94,106,210,0.00)']
    : ['rgba(255,255,255,0.06)', 'rgba(255,255,255,0.00)'];
    
  return (
    <View className={`overflow-hidden rounded-lg ${className}`} {...props}>
      <BlurView intensity={intensity} tint="dark" className="absolute inset-0" />
      <LinearGradient
        colors={tintColors}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        className="absolute inset-0"
      />
      {children}
    </View>
  );
}
```

#### 3. Migrate Key Surfaces
**Home hero card** (`src/components/home/HeroCard.tsx`):
- Replace gradient View with GlassSurface
- Use purple tint

**Session menu** (`src/components/session/SessionMenu.tsx`):
- Replace surface with GlassSurface
- Use default tint

**Modal backdrops** (`src/components/ModalBackdrop.tsx`):
- Use BlurView with high intensity

**DialogHost** (`src/components/DialogHost.tsx`):
- Update backdrop

#### 4. Performance Testing
- Profile on Genymotion Pixel 6 and Pixel 3a
- Check for frame drops during scrolling
- Set fallback threshold for low-end devices

#### 5. Fallback Strategy
Add device capability check:
```typescript
const useBlur = Platform.OS === 'ios' || (Platform.Version >= 29); // Android 10+
```

### Verification
- ✅ Glass surfaces use real BlurView
- ✅ Purple tint gradient overlays visible
- ✅ No performance regressions (≤2% frame drop)
- ✅ Fallback works on low-end devices

---

## Phase 4: Screen-by-Screen Migration (≈3 weeks)

### Goals
- Migrate all 124 files (142 StyleSheet.create call sites)
- Delete StyleSheet.create blocks
- Replace `style={styles.foo}` with `className="..."`
- Group by stack for manageable PRs

### File Groups and Order

#### Group 4a: HomeStack (7 screens, 1 PR each)
1. **HomeScreen** (`src/screens/HomeScreen.tsx`)
2. **SessionScreen** (`src/screens/SessionScreen.tsx`)
3. **LectureModeScreen** (`src/screens/LectureModeScreen.tsx`)
4. **MockTestScreen** (`src/screens/MockTestScreen.tsx`)
5. **ReviewScreen** (`src/screens/ReviewScreen.tsx`)
6. **BossBattleScreen** (`src/screens/BossBattleScreen.tsx`)
7. **InertiaScreen** (`src/screens/InertiaScreen.tsx`)
8. **ManualLogScreen** (`src/screens/ManualLogScreen.tsx`)
9. **DailyChallengeScreen** (`src/screens/DailyChallengeScreen.tsx`)
10. **FlaggedReviewScreen** (`src/screens/FlaggedReviewScreen.tsx`)
11. **GlobalTopicSearchScreen** (`src/screens/GlobalTopicSearchScreen.tsx`)

#### Group 4b: SyllabusStack
1. **SyllabusScreen** (`src/screens/SyllabusScreen.tsx`)
2. **TopicDetailScreen** (`src/screens/TopicDetailScreen.tsx`)

#### Group 4c: MenuStack
1. **StudyPlanScreen** (`src/screens/StudyPlanScreen.tsx`)
2. **StatsScreen** (`src/screens/StatsScreen.tsx`)
3. **FlashcardsScreen** (`src/screens/FlashcardsScreen.tsx`)
4. **MindMapScreen** (`src/screens/MindMapScreen.tsx`)
5. **SettingsScreen** (`src/screens/SettingsScreen.tsx`)
6. **DeviceLinkScreen** (`src/screens/DeviceLinkScreen.tsx`)
7. **NotesHubScreen** (`src/screens/NotesHubScreen.tsx`)
8. **NotesSearchScreen** (`src/screens/NotesSearchScreen.tsx`)
9. **ManualNoteCreationScreen** (`src/screens/ManualNoteCreationScreen.tsx`)
10. **TranscriptHistoryScreen** (`src/screens/TranscriptHistoryScreen.tsx`)
11. **RecordingVaultScreen** (`src/screens/RecordingVaultScreen.tsx`)
12. **ImageVaultScreen** (`src/screens/ImageVaultScreen.tsx`)
13. **NotesVaultScreen** (`src/screens/NotesVaultScreen.tsx`)
14. **TranscriptVaultScreen** (`src/screens/TranscriptVaultScreen.tsx`)
15. **QuestionBankScreen** (`src/screens/QuestionBankScreen.tsx`)
16. **FlaggedContentScreen** (`src/screens/FlaggedContentScreen.tsx`)

#### Group 4d: Root Modals (paired with Phase 6)
1. **PunishmentModeScreen** (`src/screens/PunishmentModeScreen.tsx`)
2. **BedLockScreen** (`src/screens/BedLockScreen.tsx`)
3. **DoomscrollInterceptorScreen** (`src/screens/DoomscrollInterceptor.tsx`)
4. **BreakEnforcerScreen** (`src/screens/BreakEnforcer.tsx`)
5. **LockdownScreen** (`src/screens/Lockdown.tsx`)
6. **CheckInScreen** (`src/screens/CheckIn.tsx`)
7. **BrainDumpReviewScreen** (`src/screens/BrainDumpReview.tsx`)
8. **SleepModeScreen** (`src/screens/SleepMode.tsx`)
9. **WakeUpScreen** (`src/screens/WakeUp.tsx`)
10. **LocalModelScreen** (`src/screens/LocalModel.tsx`)
11. **PomodoroQuizScreen** (`src/screens/PomodoroQuiz.tsx`)

#### Group 4e: Settings Cluster
- `src/screens/settings/components/` (all files)
- `src/components/settings/` (all files)

#### Group 4f: Chat Cluster
- `src/components/chat/` (all files)
- `GuruChatScreen` (`src/screens/GuruChatScreen.tsx`) - **Schedule last** (recent AI v2 migration)

#### Group 4g: Home Cluster
- `src/components/home/` (all files)

#### Group 4h: Shared Components
- `src/components/*.tsx` outside primitives directory

#### Group 4i: AI-Heavy Screens (Schedule Last)
- `GuruChatScreen` (already in 4f)
- `SessionScreen` (already in 4a)

### Migration Process for Each File

1. **Delete StyleSheet.create block**
2. **Replace style references**:
   - `style={styles.container}` → `className="flex-1 bg-background"`
   - `style={[styles.row, styles.active]}` → `className="flex-row items-center bg-surface"`
3. **Use theme tokens via Tailwind classes**:
   - `linearTheme.colors.textSecondary` → `text-textSecondary`
   - `linearTheme.spacing.md` → `p-4` or `gap-4`
4. **Handle dynamic styles**:
   - Use `tailwind-variants` for conditional styling
   - Use `className={button({ variant, pressed })}` pattern
5. **Run verification**:
   - `npm run verify:ci` passes
   - Visual check on device
   - Detox critical suite

### Lint Rule
Add ESLint rule to prevent new `StyleSheet.create` in migrated files:
```javascript
// .eslintrc.js
rules: {
  'no-restricted-syntax': [
    'error',
    {
      selector: 'CallExpression[callee.name="StyleSheet"][callee.property.name="create"]',
      message: 'Use NativeWind className instead of StyleSheet.create',
    },
  ],
}
```

### Verification
- ✅ Each screen renders correctly
- ✅ No layout regressions
- ✅ `npm run verify:ci` passes
- ✅ Detox critical suite passes
- ✅ No mixed StyleSheet/className usage

---

## Phase 5: Dead Code Sweep (1 day)

### Goals
- Remove unused style helpers
- Clean up redundant utilities
- Audit bundle size

### Tasks

#### 1. Remove Unused Files
- `src/utils/colorUtils.ts` (if redundant after theme generator)
- `src/utils/styleUtils.ts` (if unused)
- Any StyleSheet helper files

#### 2. Clean Up Imports
Remove unused imports:
```typescript
// Remove:
import { StyleSheet } from 'react-native';
// Keep:
import { View, Text } from 'react-native';
```

#### 3. Bundle Size Audit
Run bundle analysis:
```bash
npx expo export --platform android --output-dir bundle-analysis
```

Check for:
- NativeWind runtime size
- Removed StyleSheet objects
- Overall bundle delta

#### 4. Update Documentation
Update `AGENTS.md` styling section to reference NativeWind.

### Verification
- ✅ Bundle size reduced or flat
- ✅ No unused style utilities remain
- ✅ TypeScript compiles without warnings

---

## Phase 6: Disciplinary Screens Polish (2 days)

### Goals
- Apply pure mono treatment to punishment screens
- Remove purple accent, blur, gradients
- Emphasize "enforcement" tone

### Screens to Polish
1. **PunishmentModeScreen**
2. **BedLockScreen**
3. **DoomscrollInterceptorScreen**
4. **BreakEnforcerScreen**
5. **LockdownScreen**

### Design Changes
- **Colors**: Pure black/white/gray only
- **Borders**: Sharp, high contrast (`border-white/50`)
- **Typography**: Monospaced or heavier weights
- **No blur**: Solid surfaces only
- **No purple**: Remove all `accent` color references
- **Harsher contrast**: `text-white` on `bg-black`

### Implementation
Create `EnforcementSurface` component:
```typescript
export function EnforcementSurface({ children, className = '' }) {
  return (
    <View className={`bg-black border border-white/30 rounded-none ${className}`}>
      {children}
    </View>
  );
}
```

### Verification
- ✅ Disciplinary screens visually distinct
- ✅ No purple accent present
- ✅ No glass/blur effects
- ✅ Higher contrast than productive screens

---

## Testing Strategy

### Unit Tests (`npm run test:unit:coverage:logic`)
- Logic-allowlist tests unaffected
- UI component tests updated in Phase 2
- Run after each phase

### Detox Critical Suite (`npm run detox:test:critical:genymotion:dev`)
- Runs after Phase 2 primitives
- Runs after each Phase 4 screen PR
- Relies on `testID`, not style assertions

### Visual Smoke Test
- Metro + Genymotion after each phase
- Quick pass over each navigation stack
- Check for regressions

### CI Gate (`npm run verify:ci`)
- Must pass on every PR
- Includes lint, unit tests, logic coverage
- New lint rule prevents StyleSheet.create in migrated files

### Performance Probe (Phase 3)
- Genymotion mid-tier profile
- Scroll HomeScreen 30 seconds
- Check JS/UI frame drops via React DevTools

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| NativeWind v4 incompatibility | Verified with Expo SDK 54; fallback to runtime interop mode |
| Jest test failures | `jest-expo` preset supports className; audit StyleSheet mocks |
| Detox style references | Critical suite uses `testID` only; safe |
| BlurView Android perf | Benchmark in Phase 3; fallback for low-end devices |
| Tailwind JIT purging | Content globs cover all source roots; no dynamic concatenation |
| Merge conflicts | Phase-gated small PRs (1-3 days each) |
| AI v2 code churn | Schedule `GuruChatScreen`/`SessionScreen` last |
| Theme generator drift | CI check that generated config matches committed file |

---

## Rollback Plan

Each phase = one revertable PR:
- **Phase 0 revert**: Removes all tooling, reverts to StyleSheet-only
- **Phase 1 revert**: Restores original theme
- **Phase 2 revert**: Restores original primitives
- **Phase 3-6 reverts**: Individual screen/component rollbacks

No lingering state, no migrations, no DB changes.

---

## Success Criteria

1. **Zero `StyleSheet.create` calls** in `src/` after Phase 4 (except documented exceptions for dynamic Animated.Value styles)
2. **`npm run verify:ci` passes** at every merge
3. **Detox critical suite green**
4. **Visual QA checklist**:
   - Home hero, cards, bottom sheets use real BlurView
   - Secondary text readable (contrast ratio ≥ 4.5:1)
   - Purple accent only on productive UI
   - No layout regressions on Genymotion Pixel 6/Pixel 3a
5. **Bundle size reduced or flat**
6. **Dev experience improved**: New screens styled without importing theme manually

---

## Delegation Strategy

### Phase 0: Tooling Setup
**Mode**: Code
**Skills needed**: Expo configuration, Metro/Babel, TypeScript
**Files**: 8 configuration files, 1 generator script

### Phase 1: Theme Rewrite
**Mode**: Code
**Skills needed**: Color theory, WCAG compliance, theme system
**Files**: 1 theme file, generator script updates

### Phase 2: Primitive Internals
**Mode**: Code
**Skills needed**: Component design, tailwind-variants, unit testing
**Files**: 13 primitive components, migration script

### Phase 3: BlurView Glass
**Mode**: Code
**Skills needed**: Performance optimization, Android graphics
**Files**: GlassSurface component, 5+ surface updates

### Phase 4: Screen-by-Screen Migration
**Mode**: Code (multiple parallel tasks)
**Skills needed**: Systematic refactoring, visual QA
**Files**: 124 files across 8 groups

### Phase 5: Dead Code Sweep
**Mode**: Code
**Skills needed**: Bundle analysis, cleanup
**Files**: Various utility files

### Phase 6: Disciplinary Screens Polish
**Mode**: Code
**Skills needed**: Visual design, UX consistency
**Files**: 5 disciplinary screens

---

## Next Steps

1. **Review this plan** for completeness and feasibility
2. **Start Phase 0** (Tooling Setup) in Code mode
3. **Proceed sequentially** through phases
4. **Maintain CI green** at every step
5. **Document learnings** for future migrations

**Estimated total effort**: 5-6 weeks of focused work, phased for minimal disruption.