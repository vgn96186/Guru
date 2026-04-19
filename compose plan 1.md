# Jetpack Compose Migration Program for Guru Android

## Summary
- **Goal:** enhance the Android app with Jetpack Compose where it materially improves polish, animation, Android-native UX, and maintainability, without rewriting the Expo/React Native core.
- **Architecture:** use **Compose islands inside React Native** as the default pattern. Keep orchestration, data, AI, DB, and navigation in TypeScript; move only Android-native presentation surfaces into Compose. Keep service-owned UI inside the native module that owns the service.
- **Primary implementation centers:** expand `modules/omni-canvas` as the reusable Compose view layer, keep the floating overlay in `modules/app-launcher/android/src/main/java/expo/modules/applauncher/OverlayService.kt`, and add thin TS wrappers around new native views in `src/components/native/`.
- **Delivery model:** ship in ordered phases so each phase is user-visible, testable, and independently revertable.

## Implementation Changes
### Phase 0: Compose platform foundation
- Standardize one Android-native UI layer in `modules/omni-canvas/android/src/main/java/expo/modules/omnicanvas/` for reusable Compose views and keep `modules/omni-canvas/index.ts` as the only RN-facing API surface.
- Add a shared Compose design system module inside `omni-canvas` for colors, spacing, elevation, typography, motion timings, and sheet/card primitives so every migrated surface uses the same tokens.
- Add a strict wrapper convention in TS: each native view gets a dedicated RN wrapper component, Android-only guard, prop mapping, and fallback behavior for non-Android.
- Keep all native props serializable and one-way; emit only small callback events from Compose back to RN.

### Phase 1: Floating lecture overlay migration
- Replace the imperative custom overlay drawing in `OverlayService.kt` with a `ComposeView`-backed overlay bubble while preserving the existing foreground service lifecycle, intent actions, preference flags, and face-tracking state machine.
- Keep camera, ML Kit, timer, and absent/drowsy logic in Kotlin service code; migrate only rendering, animation, and interaction chrome to Compose.
- Preserve current actions and state transitions: show, hide, pause, resume, lecture-return request, pomodoro-break request, and notification behavior.
- Add Compose variants for neutral, focused, distracted, drowsy, and absent states with explicit visual parity targets for color, pulse, and elapsed-time display.
- Do not move this surface into `omni-canvas`; it stays in `app-launcher` because it is service-owned UI.

### Phase 2: Android-native sheets and transient surfaces
- Build a Compose **Lecture Return Sheet** native view and keep `useLecturePipeline` and `useLectureReturnRecovery` in TS as the state owners.
- Build a Compose **Action Hub / external-app launcher sheet** native view and keep launch logic, permissions, and transcript/recovery orchestration in TS.
- Pass fully prepared view state from RN into Compose; Compose only renders and emits user actions like expand, dismiss, mark studied, mark-and-quiz, skip, choose subject, choose confidence, and launch app.
- Use the same pattern for other transient Android-only surfaces that already behave like bottom sheets or compact overlays before attempting any full-screen migration.

### Phase 3: Expand existing Compose islands on learning and dashboard surfaces
- Keep the current native components already in use and treat them as the pattern to extend: `ProgressDashboard`, `StartButton`, `LoadingOrb`, `Flashcard`, `GuruChatList`, and `MindMapCanvas`.
- Home screen: keep the RN screen shell, but migrate the most visual subtrees to Compose in this order:
  1. quick stats strip
  2. next-lecture cards
  3. agenda card list
  4. AI status / hero cluster if still visually fragmented after the first three
- Chat screen: keep composer, routing, tool orchestration, and data loading in RN/TS; extend `GuruChatList` to support richer bubble styles, streaming states, source blocks, and image/tool result cards.
- Flashcards: keep current native card rendering and add native support for swipe affordances, rating cues, and answer-state transitions so review feels consistent with Android motion.
- Mind map: keep the existing native Android canvas path and use it as the default Android implementation; only extend it for additional gestures, overlays, and selection chrome, not for data ownership.

### Phase 4: Settings and vault screens
- Migrate the visually dense Android-only settings subtree into Compose sections: provider cards, validation states, accordions, permission rows, model selectors, and storage/backup actions.
- Keep profile reads/writes, provider health checks, OAuth/device-code flows, backup logic, and notification permission calls in TS services.
- Migrate `RecordingVault` list rows, batch selection UI, status banners, and per-recording actions into Compose while leaving scanning, SAF access, copying, transcription, and persistence in TS/native services.
- Use RN as the screen shell initially so existing navigation and deep links do not change.

### Phase 5: Focus-mode and strict-mode screens
- Convert the Android presentation layer of the strict modal routes into Compose-backed native views embedded inside the existing RN routes: `BedLock`, `PunishmentMode`, `BreakEnforcer`, `WakeUp`, `SleepMode`, and `DoomscrollInterceptor`.
- Preserve React Navigation route ownership and existing screen names; do not introduce Compose navigation in this program.
- If any one screen later requires window-level Android flags or task behavior that RN cannot safely control, split only that screen into a dedicated Android activity as a separate follow-up, not in the initial migration.

### Phase 6: Lecture mode partial migration
- Do **not** rewrite `LectureModeScreen` end-to-end first.
- Migrate only the Android-native presentation subpanels with high ROI:
  1. timer and focus HUD
  2. proof-of-life prompt and warning state
  3. break countdown panel
  4. recording/transcribing status chrome
- Keep recording, persistence, transcription, offline queueing, XP/session mutation, and sync logic in TS.

### Explicit non-goals
- Do not migrate `RootNavigator` or `TabNavigator` to Compose navigation.
- Do not move AI routing, DB access, Zustand/query state, or study-planning logic to Kotlin.
- Do not do a full-screen-by-screen React Native rewrite just because Compose is available.
- Do not break iOS or non-Android behavior; every Compose migration must preserve RN fallback behavior.

## Public APIs / Interfaces / Types
- Extend `modules/omni-canvas/index.ts` with new native view prop types for:
  - lecture return sheet
  - action hub sheet
  - quick stats strip
  - next lecture panel
  - settings dashboard sections
  - recording vault list
  - focus-mode panels where embedded-native rendering is chosen
- Each new prop type must follow the same contract style as current components: plain data props plus explicit callback events.
- Create one RN wrapper per native view in `src/components/native/` with:
  - Android-only rendering
  - non-Android fallback to the existing RN component
  - stable TS prop names matching the native prop types
- Keep event contracts semantic and narrow, for example:
  - `onDismiss`
  - `onPrimaryAction`
  - `onSecondaryAction`
  - `onSelectSubject`
  - `onSelectConfidence`
  - `onLaunchApp`
  - `onToggleSection`
- Do not expose service internals, database shapes, or Kotlin-only state to RN; RN continues to supply already-derived view models.

## Test Plan
- **Wrapper unit tests:** verify every new RN wrapper maps props/events correctly and falls back to the existing RN implementation on non-Android.
- **Android instrumentation tests:** cover overlay rendering states, sheet open/close transitions, action callbacks, chat streaming list behavior, flashcard flip/rating behavior, and vault row interactions.
- **Detox critical flows:** verify no regression in:
  - launching an external lecture app
  - returning from a lecture and completing the lecture-return flow
  - opening Home and using the native start/dashboard widgets
  - using chat on Android with streaming
  - reviewing flashcards
  - scanning and opening recordings in Recording Vault
  - opening Settings and using permission/provider sections
- **Regression checks:** confirm existing TS logic remains the source of truth by asserting UI updates after DB/profile/query changes without duplicating logic in Kotlin.
- **Acceptance criteria per phase:** each shipped phase must preserve current behavior, improve visual smoothness on Android, and leave iOS/non-Android on the existing RN path with no functional drift.

## Assumptions and Defaults
- “All of these” means all migration candidates previously identified, including recommended phases and explicitly deferred low-ROI areas.
- Default strategy is **incremental Compose islands**, not a full rewrite.
- Android is the only target for Compose enhancements in this program; iOS and other platforms keep the current RN implementation unless already supported.
- Existing Compose infrastructure in the app and `omni-canvas` is the approved foundation; no new parallel native UI module should be introduced.
- The current minimum Android baseline and Compose setup are sufficient; the program assumes no app-wide AGP/Kotlin/SDK migration is needed before starting.
- Tests remain in the current stack: Jest for TS wrappers/logic, Android native tests for Compose behavior, Detox for end-to-end validation.
