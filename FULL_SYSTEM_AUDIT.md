# Full System Flow Audit

## 1. Onboarding & Check-In Flow (`RootNavigator.tsx` & `CheckInScreen.tsx`)

**Flow Overview**: Users are gated by a mood and time selection screen before reaching the home dashboard to set expectations. If they use "Quick Start" 3 times in a row, the app auto-skips this screen on future launches.
**Issues / Improvements**:

- **State Coupling**: `RootNavigator` relies on a React `useEffect` to trigger `checkinToday('good')` and `setDailyAvailability(30)` if the auto-skip threshold is met. This briefly mounts the `CheckInScreen` or delays the initial render while the state updates asynchronously.
- **UX Improvement**: Evaluate the check-in auto-skip state synchronously before the `Stack.Navigator` initializes its `initialRouteName` to prevent a flash of the check-in screen.
- **Accessibility**: The `TimeOption` buttons lack proper accessibility states. While `CheckInScreen` has the best a11y in the app, it still lacks `accessibilityState={{ selected: isSelected }}`.

## 2. Dashboard Flow (`HomeScreen.tsx`)

**Flow Overview**: The primary hub displaying progress rings, streak shields, pending external lecture transciptions, and dynamic study agendas.
**Issues / Improvements**:

- **Mount Freezes**: `HomeScreen` uses `useEffect` to call `markNemesisTopics`, `getWeakestTopics`, `getTopicsDueForReview`, and `getTodaysAgendaWithTimes` (which triggers `generateStudyPlan`). All of these are heavy SQLite operations running on the JS thread sequentially, causing a noticeable UI stutter when returning to the Home tab.
- **UX Improvement**: Introduce `InteractionManager.runAfterInteractions` or wrap these database fetches in asynchronous yields (`await new Promise(r => setTimeout(r, 0))`) so the initial render of the `HomeScreen` can mount the UI shell immediately before data populates.
- **Error Swallowing**: The `checkForReturnedSession` logic has a 3-retry loop of 200ms when validating returning lecture files. If it fails, it warns but drops the path silently without surfacing the error to the UI, leading to "lost" lectures.

## 3. Dynamic Study Planning Flow (`StudyPlanScreen.tsx` & `studyPlanner.ts`)

**Flow Overview**: Calculates a dynamic multi-day calendar based on FSRS reviews, weak spots, and high-yield topic weights.
**Issues / Improvements**:

- **Algorithmic Complexity**: `generateStudyPlan` iterates through `getAllTopicsWithProgress()` multiple times to bucket them into `due`, `weak`, and `remaining`. As the topic list scales, this synchronous O(N) sort will crash older Android devices.
- **UX Improvement**: Push the filtering and sorting logic down to the SQL layer. A single complex query grouping topics by `fsrs_due`, `confidence`, and `inicet_priority` would execute in milliseconds compared to JS array mapping.
- **Visual Glitches**: When changing "Plan Modes" (Balanced vs High Yield), the screen stutters because it synchronously recalculates the entire calendar on the main thread before updating React state.

## 4. Active Study Session Flow (`SessionScreen.tsx` & `ReviewScreen.tsx`)

**Flow Overview**: The core study loops. `SessionScreen` handles AI-generated study material and timers. `ReviewScreen` handles FSRS flashcard reviews.
**Issues / Improvements**:

- **Missing Break/Pause Visuals**: `SessionScreen` has `store.isPaused` state, but the UI doesn't clearly overlay a "PAUSED" state over the content, meaning users might read content without their timer tracking.
- **AI Error Handling UX**: If `generateJSONWithRouting` fails, `SessionScreen` shows a jarring text error. The fallback `manualBtn` (Manual Review) forces the user to study without notes, which is frustrating if they expected a quiz.
- **Audio Overlap Risk**: `ReviewScreen` initiates `expo-speech` (TTS) on flip but doesn't manage audio focus aggressively against other media apps.

## 5. Settings & Utility Flows (`SettingsScreen.tsx` & `DeviceLinkScreen.tsx`)

**Flow Overview**: User configuration, API keys, database backup/restore, and MQTT syncing.
**Issues / Improvements**:

- **Overwhelming UI**: `SettingsScreen.tsx` is exceptionally long. Even with collapsible sections, users have to scroll significantly to find "Clear Cache" or "Backup".
- **UX Improvement**: Break `SettingsScreen` into a nested Stack Navigator (e.g., Settings -> "AI & Models", Settings -> "Data & Backup").
- **Security Vulnerability**: As noted in previous audits, `DeviceLinkScreen.tsx` generates a random string used on an open public MQTT broker without encryption.

## 6. Behavioral Interventions (`BreakEnforcerScreen.tsx` & `LockdownScreen.tsx`)

**Flow Overview**: Anti-distraction screens that block the user.
**Issues / Improvements**:

- **Hardware Back Button Trap**: `LockdownScreen` aggressively traps the hardware back button. While intentional, if the app bugs out and the timer freezes (e.g., due to background AppState suspension issues in React Native), the user has to force-close the app to escape.
- **UX Improvement**: Always provide a hidden or explicit (but punishing) exit hatch, such as holding a button for 10 seconds or typing a complicated phrase to exit.
