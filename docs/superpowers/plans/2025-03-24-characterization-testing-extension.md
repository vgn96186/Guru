# Characterization Testing Extension Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend characterization tests to cover all hooks, stores, navigation components, and UI components in the specified directories.

**Architecture:** 
- Identify all public exports (functions, hooks, components) in each file.
- Create or expand `.unit.test.ts` or `.test.tsx` files.
- Follow the 4-step workflow: Understand -> Characterize -> Edge Cases -> Summarize.
- Use `react-hooks-testing-library` for hooks and `react-test-renderer` or `@testing-library/react-native` for components.

**Tech Stack:** 
- Jest
- ts-jest
- react-hooks-testing-library
- react-test-renderer / @testing-library/react-native

---

### Task 1: src/hooks/ Directory

**Files:**
- `src/hooks/useLectureTranscription.ts`
- `src/hooks/useGuruPresence.ts`
- `src/hooks/useFaceTracking.ts`
- `src/hooks/useHomeDashboardData.ts`
- `src/hooks/useAppInitialization.ts`
- `src/hooks/useLecturePipeline.ts`
- `src/hooks/useAppBootstrap.ts`
- `src/hooks/useLectureReturnRecovery.ts`
- `src/hooks/useResponsive.ts`
- `src/hooks/useIdleTimer.ts`

- [ ] **Step 1: Create/Expand tests for `useLectureTranscription.ts`**
  - Run: `npm run test:unit src/hooks/useLectureTranscription.unit.test.ts`
- [ ] **Step 2: Create/Expand tests for `useGuruPresence.ts`**
  - Run: `npm run test:unit src/hooks/useGuruPresence.unit.test.ts`
- [ ] **Step 3: Create/Expand tests for `useFaceTracking.ts`**
  - Run: `npm run test:unit src/hooks/useFaceTracking.unit.test.ts`
- [ ] **Step 4: Create/Expand tests for `useHomeDashboardData.ts`**
  - Run: `npm run test:unit src/hooks/useHomeDashboardData.unit.test.ts`
- [ ] **Step 5: Create/Expand tests for `useAppInitialization.ts`**
  - Run: `npm run test:unit src/hooks/useAppInitialization.unit.test.ts`
- [ ] **Step 6: Create/Expand tests for `useLecturePipeline.ts`**
  - Run: `npm run test:unit src/hooks/useLecturePipeline.unit.test.ts`
- [ ] **Step 7: Create/Expand tests for `useAppBootstrap.ts`**
  - Run: `npm run test:unit src/hooks/useAppBootstrap.unit.test.ts`
- [ ] **Step 8: Expand tests for `useLectureReturnRecovery.ts`**
  - Run: `npm run test:unit src/hooks/useLectureReturnRecovery.unit.test.ts`
- [ ] **Step 9: Expand tests for `useResponsive.ts`**
  - Run: `npm run test:unit src/hooks/useResponsive.unit.test.ts`
- [ ] **Step 10: Create/Expand tests for `useIdleTimer.ts`**
  - Run: `npm run test:unit src/hooks/useIdleTimer.unit.test.ts`

### Task 2: src/store/ Directory

**Files:**
- `src/store/useSessionStore.ts`
- `src/store/splitSessionStorage.ts`
- `src/store/useAppStore.ts`

- [ ] **Step 1: Create/Expand tests for `useSessionStore.ts`**
  - Run: `npm run test:unit src/store/useSessionStore.unit.test.ts`
- [ ] **Step 2: Create/Expand tests for `splitSessionStorage.ts`**
  - Run: `npm run test:unit src/store/splitSessionStorage.unit.test.ts`
- [ ] **Step 3: Create/Expand tests for `useAppStore.ts`**
  - Run: `npm run test:unit src/store/useAppStore.unit.test.ts`

### Task 3: src/navigation/ Directory

**Files:**
- `src/navigation/navigationRef.ts`
- `src/navigation/linking.ts`
- `src/navigation/types.ts`
- `src/navigation/RootNavigator.tsx`
- `src/navigation/TabNavigator.tsx`

- [ ] **Step 1: Create/Expand tests for `navigationRef.ts`**
  - Run: `npm run test:unit src/navigation/navigationRef.unit.test.ts`
- [ ] **Step 2: Create/Expand tests for `linking.ts`**
  - Run: `npm run test:unit src/navigation/linking.unit.test.ts`
- [ ] **Step 3: Create/Expand tests for `RootNavigator.tsx`**
  - Run: `npm run test:unit src/navigation/RootNavigator.test.tsx`
- [ ] **Step 4: Create/Expand tests for `TabNavigator.tsx`**
  - Run: `npm run test:unit src/navigation/TabNavigator.test.tsx`

### Task 4: src/components/ Directory

**Files:**
- All files in `src/components/` and its subdirectories.

- [ ] **Step 1: Batch cover all components in `src/components/settings/`**
- [ ] **Step 2: Batch cover all components in `src/components/home/`**
- [ ] **Step 3: Create/Expand tests for remaining individual components in `src/components/`**
  - `GuruChatOverlay.tsx`
  - `LectureReturnSheet.tsx`
  - `ReviewCalendar.tsx`
  - `FocusAudioPlayer.tsx`
  - `ScreenHeader.tsx`
  - `TopicPillRow.tsx`
  - `ConfidenceSelector.tsx`
  - `SubjectChip.tsx`
  - `MarkdownRender.tsx`
  - `LoadingOrb.tsx`
  - `VisualTimer.tsx`
  - `StartButton.tsx`
  - `SubjectCard.tsx`
  - `Toast.tsx`
  - `ErrorBoundary.tsx`
  - `BrainDumpFab.tsx`

### Task 5: Final Summary and Documentation

- [ ] **Step 1: Consolidate captured behaviors and potential improvements.**
- [ ] **Step 2: Ensure all tests pass across all directories.**
- [ ] **Step 3: Final review of characterization coverage.**
