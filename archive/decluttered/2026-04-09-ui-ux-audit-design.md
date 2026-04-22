# UI/UX Audit — Guru App

**Date:** 9 April 2026
**Scope:** Full UI/UX audit across 3 dimensions: Visual Consistency, UX Flows, ADHD-Specific Design

## Audit Summary

- **Critical findings:** 5 (3 fixed, 1 skipped, 1 deferred)
- **Major findings:** 15 (partially addressed)
- **Positives identified:** 25+

## Changes Made

### 1. Shame-Based Language → Supportive Accountability ✅ FIXED

**Files changed:**

- `src/screens/PunishmentMode.tsx`
- `src/screens/BedLockScreen.tsx`
- `src/screens/DoomscrollInterceptor.tsx`

**Changes:**

- `PunishmentMode`: Renamed `shameLevel` → `urgencyLevel`, `harassmentTimer` → `nudgeTimer`, `shameMessages` → `accountabilityMessages`. Titles changed: "PATHETIC" → "Time to Reset", "GET UP" → "Let's Go", "Lazy Day?" → "Gentle Nudge". Quote at level 3: "You promised yourself you'd be a doctor. Prove it." → "You chose this path for a reason. One card at a time." Button label: "❌ Give Up" → "❌ Reduce Intensity". Confirm dialog: "Disable punishment mode and accept your laziness?" → "Switch to a gentler reminder mode?"
- `BedLockScreen`: Shame subtitle after 3+ nudges: "Your NEET exam doesn't care about your comfort." → "A fresh mind studies better — but if you're ready, let's go." Button: "Unlock Anyway (Cheating)" → "Exit Anyway". Confirm: "Cheating?" → "Need a Break?"
- `DoomscrollInterceptor`: `shameMessages` → `accountabilityMessages`. Titles: "PATHETIC" → "Let's Refocus", "DISAPPOINTMENT" → "One More Scroll...". "Shame Delay" → "Cool Down". Fixed inline hex colors `#0A0A14` and `#1A0505` → `n.colors.surface` and `n.colors.errorSurface`.

### 2. BedLock Accelerometer — Mock → Real ✅ FIXED

**File:** `src/screens/BedLockScreen.tsx`

**Changes:**

- Replaced mock `Math.random()` accelerometer simulation with real `expo-sensors` `Accelerometer` API.
- Added `import { Accelerometer } from 'expo-sensors'`.
- Detecting phase: Now uses `Accelerometer.addListener()` to read real Z-axis values.
- Sit-up phase: Real accelerometer tracking with 500ms update interval.
- Added cleanup: `Accelerometer.removeAllListeners()` on phase change/unlock.
- Fixed inline hex color `#6C63FF` → `n.colors.accent`.

### 3. No Onboarding ⏭️ SKIPPED

User confirmed this is a personal-use app. No onboarding needed.

### 4. SettingsScreen 5,500+ lines — DEFERRED

Already partially split into `settings/sections/`. Remaining inline content removal requires careful testing. Deferred to a dedicated session.

### 5. Unbounded FlatLists — DEFERRED

NotesVault (500 items), TranscriptHistory (200 items), TranscriptVault need pagination/windowing. Deferred to a dedicated session.

## Remaining Recommendations (Not Yet Implemented)

1. **Add "Bad Day" mode** — On low-energy days, offer single minimal task instead of full plan
2. **Split SettingsScreen** — Remove remaining inline content, delegate fully to sections/
3. **Add pagination to FlatLists** — windowSize, maxToRenderPerBatch for NotesVault, TranscriptHistory, TranscriptVault
4. **Add missing empty states** — NotesVault, ImageVault, TranscriptVault, Flashcards
5. **Add missing loading states** — NotesVault, TranscriptHistory, StatsScreen
6. **Consistent ErrorBoundary** — Wrap all screens with error boundaries
7. **State persistence** — Scroll position, form inputs, navigation state on app background

## Tone Consistency Guidelines

Going forward, all Guru messaging should follow the **InertiaScreen template**:

- Firm but warm
- Focused on action, not guilt
- Playful without being condescending
- Acknowledges low-energy states without judgment
- Uses "we" language when possible

Avoid:

- ALL CAPS shouting ("PATHETIC", "GET UP")
- Guilt-based framing ("Your exam doesn't care about your comfort")
- Shame as a metric ("shame level")
- Labels that attack identity ("cheating", "lazy")
